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
    /** Updates only [fields] on [path]; the rules see an update (or a create if it's missing). */
    fun patch(path: String, fields: Map<String, Any?>, idToken: String): Boolean = merge(path, fields, idToken)

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
    fun merge(path: String, fields: Map<String, Any?>, idToken: String, mask: List<String> = fields.keys.toList()): Boolean {
        val builder = url(path)
        mask.forEach { builder.addQueryParameter("updateMask.fieldPaths", it) }
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

    /** Documents in [collectionId] matching every equality in [equals]; same error contract as [queryEquals]. */
    fun queryAllEqual(collectionId: String, equals: Map<String, String>, idToken: String, limit: Int = 500): List<Pair<String, JSONObject>>? {
        val filters = JSONArray()
        equals.forEach { (field, value) ->
            filters.put(
                JSONObject().put(
                    "fieldFilter", JSONObject()
                        .put("field", JSONObject().put("fieldPath", field))
                        .put("op", "EQUAL")
                        .put("value", JSONObject().put("stringValue", value))
                )
            )
        }
        val where = if (filters.length() == 1) filters.getJSONObject(0)
        else JSONObject().put("compositeFilter", JSONObject().put("op", "AND").put("filters", filters))
        val body = JSONObject().put(
            "structuredQuery", JSONObject()
                .put("from", JSONArray().put(JSONObject().put("collectionId", collectionId)))
                .put("where", where)
                .put("limit", limit)
        )
        val request = Request.Builder()
            .url("$root:runQuery")
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

    /**
     * Atomically sets [fields] on an existing doc and appends [append] to the
     * array field [arrayField] (arrayUnion), so two people sending at once
     * can't overwrite each other's message.
     */
    fun updateAndAppend(
        path: String,
        fields: Map<String, Any?>,
        arrayField: String,
        append: List<Any?>,
        idToken: String
    ): Boolean {
        val docName = "projects/${Config.FIREBASE_PROJECT_ID}/databases/${Config.FIRESTORE_DATABASE_ID}/documents/$path"
        val write = JSONObject()
            .put("update", JSONObject().put("name", docName).put("fields", encodeFields(fields)))
            .put("updateMask", JSONObject().put("fieldPaths", JSONArray(fields.keys.toList())))
            .put(
                "updateTransforms", JSONArray().put(
                    JSONObject()
                        .put("fieldPath", arrayField)
                        .put("appendMissingElements", JSONObject().put("values", JSONArray().apply { append.forEach { put(encode(it)) } }))
                )
            )
            .put("currentDocument", JSONObject().put("exists", true))
        val request = Request.Builder()
            .url("${root.substringBeforeLast("/documents")}/documents:commit")
            .header("Authorization", "Bearer $idToken")
            .post(JSONObject().put("writes", JSONArray().put(write)).toString().toRequestBody(json))
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

        /** Firestore typed value -> plain Kotlin (String/Long/Double/Boolean/Map/List/null). */
        fun decode(value: JSONObject?): Any? {
            if (value == null) return null
            return when {
                value.has("stringValue") -> value.getString("stringValue")
                value.has("integerValue") -> value.getString("integerValue").toLongOrNull()
                value.has("doubleValue") -> value.getDouble("doubleValue")
                value.has("booleanValue") -> value.getBoolean("booleanValue")
                value.has("timestampValue") -> value.getString("timestampValue")
                value.has("mapValue") -> decodeFields(value.getJSONObject("mapValue").optJSONObject("fields"))
                value.has("arrayValue") -> {
                    val values = value.getJSONObject("arrayValue").optJSONArray("values") ?: JSONArray()
                    (0 until values.length()).map { decode(values.optJSONObject(it)) }
                }
                else -> null
            }
        }

        fun decodeFields(fields: JSONObject?): Map<String, Any?> {
            if (fields == null) return emptyMap()
            return fields.keys().asSequence().associateWith { decode(fields.optJSONObject(it)) }
        }

        private fun encode(value: Any?): JSONObject = JSONObject().apply {
            when (value) {
                null -> put("nullValue", JSONObject.NULL)
                is Map<*, *> -> put(
                    "mapValue",
                    JSONObject().put("fields", JSONObject().apply { value.forEach { (k, v) -> put(k.toString(), encode(v)) } })
                )
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

        fun encodeFields(fields: Map<String, Any?>): JSONObject =
            JSONObject().apply { fields.forEach { (k, v) -> put(k, encode(v)) } }
    }
}
