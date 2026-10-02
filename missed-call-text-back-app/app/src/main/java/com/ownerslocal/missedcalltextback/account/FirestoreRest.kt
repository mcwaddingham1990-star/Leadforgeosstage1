package com.ownerslocal.missedcalltextback.account

import com.ownerslocal.missedcalltextback.Config
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

sealed class DocResult {
    data class Found(val fields: JSONObject) : DocResult()
    object Missing : DocResult()
    data class Error(val code: Int, val message: String) : DocResult()
}

enum class WriteResult {
    WRITTEN,
    ALREADY_EXISTS,
    /** Rules said no (403). Retrying won't help. */
    DENIED,
    /** Network or server trouble. Worth retrying. */
    FAILED
}

/**
 * Minimal Firestore REST client. Every call carries the user's ID token, so
 * the same firestore.rules that govern the web app govern this app.
 */
class FirestoreRest(private val http: OkHttpClient) {
    private val json = "application/json".toMediaType()
    private val root = "https://firestore.googleapis.com/v1/projects/${Config.FIREBASE_PROJECT_ID}" +
        "/databases/${Config.FIRESTORE_DATABASE_ID}/documents"

    /** [path] is slash-separated collection/doc segments; each segment is URL-encoded. */
    private fun url(path: String): okhttp3.HttpUrl.Builder {
        val builder = root.toHttpUrl().newBuilder()
        path.split('/').filter { it.isNotEmpty() }.forEach { builder.addPathSegment(it) }
        return builder
    }

    fun get(path: String, idToken: String): DocResult {
        val request = Request.Builder().url(url(path).build()).header("Authorization", "Bearer $idToken").get().build()
        return try {
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                when {
                    response.code == 404 -> DocResult.Missing
                    !response.isSuccessful -> DocResult.Error(response.code, errorMessage(text))
                    else -> DocResult.Found(JSONObject(text).optJSONObject("fields") ?: JSONObject())
                }
            }
        } catch (e: IOException) {
            DocResult.Error(0, "No connection")
        }
    }

    /**
     * Documents in [collectionId] (under [parentPath], "" for root) where
     * [field] == [value]. Empty when the rules deny the read (this login
     * can't see that collection); null on a network/server error.
     */
    fun queryEquals(
        collectionId: String,
        field: String,
        value: String,
        idToken: String,
        parentPath: String = "",
        limit: Int = 2000
    ): List<Pair<String, JSONObject>>? {
        val body = JSONObject().put(
            "structuredQuery", JSONObject()
                .put("from", JSONArray().put(JSONObject().put("collectionId", collectionId)))
                .put(
                    "where", JSONObject().put(
                        "fieldFilter", JSONObject()
                            .put("field", JSONObject().put("fieldPath", field))
                            .put("op", "EQUAL")
                            .put("value", JSONObject().put("stringValue", value))
                    )
                )
                .put("limit", limit)
        )
        val base = if (parentPath.isEmpty()) root else url(parentPath).build().toString()
        val request = Request.Builder()
            .url("$base:runQuery")
            .header("Authorization", "Bearer $idToken")
            .post(body.toString().toRequestBody(json))
            .build()
        return try {
            http.newCall(request).execute().use { response ->
                if (response.code == 403) return emptyList()
                if (!response.isSuccessful) return null
                val results = JSONArray(response.body?.string().orEmpty())
                (0 until results.length()).mapNotNull { i ->
                    val doc = results.optJSONObject(i)?.optJSONObject("document") ?: return@mapNotNull null
                    doc.optString("name").substringAfterLast('/') to (doc.optJSONObject("fields") ?: JSONObject())
                }
            }
        } catch (e: IOException) {
            null
        } catch (e: org.json.JSONException) {
            null
        }
    }

    /** Create with a caller-chosen ID, so retries can't duplicate. */
    fun create(collectionPath: String, documentId: String, fields: Map<String, Any?>, idToken: String): WriteResult {
        val request = Request.Builder()
            .url(url(collectionPath).addQueryParameter("documentId", documentId).build())
            .header("Authorization", "Bearer $idToken")
            .post(JSONObject().put("fields", encodeFields(fields)).toString().toRequestBody(json))
            .build()
        return try {
            http.newCall(request).execute().use { response ->
                when {
                    response.isSuccessful -> WriteResult.WRITTEN
                    response.code == 409 -> WriteResult.ALREADY_EXISTS
                    response.code == 403 -> WriteResult.DENIED
                    else -> WriteResult.FAILED
                }
            }
        } catch (e: IOException) {
            WriteResult.FAILED
        }
    }

    /** Merge-writes only [fields] (creating the doc if needed), leaving every other field intact. */
    fun merge(path: String, fields: Map<String, Any?>, idToken: String): Boolean {
        val builder = url(path)
        fields.keys.forEach { builder.addQueryParameter("updateMask.fieldPaths", it) }
        val request = Request.Builder()
            .url(builder.build())
            .header("Authorization", "Bearer $idToken")
            .patch(JSONObject().put("fields", encodeFields(fields)).toString().toRequestBody(json))
            .build()
        return try {
            http.newCall(request).execute().use { it.isSuccessful }
        } catch (e: IOException) {
            false
        }
    }

    private fun errorMessage(body: String): String = try {
        JSONObject(body).getJSONObject("error").optString("status", "ERROR")
    } catch (e: Exception) {
        "ERROR"
    }

    companion object {
        fun string(fields: JSONObject?, name: String): String? =
            fields?.optJSONObject(name)?.takeIf { it.has("stringValue") }?.getString("stringValue")

        fun bool(fields: JSONObject?, name: String): Boolean? =
            fields?.optJSONObject(name)?.takeIf { it.has("booleanValue") }?.getBoolean("booleanValue")

        /** Accepts an ISO string or a Firestore timestamp; returns epoch millis. */
        fun timeMillis(fields: JSONObject?, name: String): Long? {
            val field = fields?.optJSONObject(name) ?: return null
            val raw = when {
                field.has("timestampValue") -> field.getString("timestampValue")
                field.has("stringValue") -> field.getString("stringValue")
                field.has("integerValue") -> return field.getString("integerValue").toLongOrNull()
                else -> return null
            }
            return try {
                java.time.Instant.parse(raw).toEpochMilli()
            } catch (e: Exception) {
                null
            }
        }

        fun stringList(fields: JSONObject?, name: String): List<String> {
            val values = fields?.optJSONObject(name)?.optJSONObject("arrayValue")?.optJSONArray("values")
                ?: return emptyList()
            return (0 until values.length()).mapNotNull { i ->
                values.optJSONObject(i)?.takeIf { it.has("stringValue") }?.getString("stringValue")
            }
        }

        private fun encode(value: Any?): JSONObject = JSONObject().apply {
            when (value) {
                null -> put("nullValue", JSONObject.NULL)
                is Boolean -> put("booleanValue", value)
                is Int, is Long -> put("integerValue", value.toString())
                is Double -> put("doubleValue", value)
                is Collection<*> -> put(
                    "arrayValue",
                    JSONObject().put("values", JSONArray().apply { value.forEach { put(encode(it)) } })
                )
                else -> put("stringValue", value.toString())
            }
        }

        private fun encodeFields(fields: Map<String, Any?>): JSONObject =
            JSONObject().apply { fields.forEach { (k, v) -> put(k, encode(v)) } }
    }
}
