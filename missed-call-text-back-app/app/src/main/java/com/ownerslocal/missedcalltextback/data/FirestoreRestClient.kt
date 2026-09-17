package com.ownerslocal.missedcalltextback.data

import com.ownerslocal.missedcalltextback.Config
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/**
 * Minimal Firestore REST client. Started out read-only (exactly the two
 * documents the settings sync needs); now also supports the query + write
 * calls the CRM linker needs (look up a customer/lead by phone, create a
 * new lead, log a missed-call event) -- all through the same REST surface,
 * bound by the same firestore.rules the web app is bound by, since both go
 * through rule evaluation against the same ID token.
 */
class FirestoreRestClient(private val http: OkHttpClient) {
    private val jsonMedia = "application/json".toMediaType()
    private val baseUrl = "https://firestore.googleapis.com/v1/projects/${Config.FIREBASE_PROJECT_ID}" +
        "/databases/${Config.FIRESTORE_DATABASE_ID}/documents"

    /** Returns the document's "fields" object, or null if it doesn't exist or the request failed. */
    fun getDocumentFields(collectionPath: String, documentId: String, idToken: String): JSONObject? {
        val encodedId = java.net.URLEncoder.encode(documentId, "UTF-8")
        val request = Request.Builder()
            .url("$baseUrl/$collectionPath/$encodedId")
            .header("Authorization", "Bearer $idToken")
            .get()
            .build()

        return try {
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val json = JSONObject(response.body?.string().orEmpty())
                json.optJSONObject("fields")
            }
        } catch (e: IOException) {
            null
        }
    }

    /**
     * Every document (id + fields) in [collectionPath] whose [whereField]
     * equals [whereValue]. Used instead of a server-side phone-number
     * filter because phone numbers are stored however the owner originally
     * typed them (dashes, parens, spaces, a leading "+1" or not) -- an
     * exact-match Firestore query on the raw call-log number would miss
     * real matches constantly. Fetching everything for this one business
     * and comparing normalized digits client-side (see CrmLinker) is simple
     * and, for the local-service-business scale this app targets, cheap.
     */
    fun queryByField(collectionPath: String, whereField: String, whereValue: String, idToken: String): List<Pair<String, JSONObject>> {
        val body = JSONObject().apply {
            put("structuredQuery", JSONObject().apply {
                put("from", JSONArray().put(JSONObject().put("collectionId", collectionPath)))
                put("where", JSONObject().apply {
                    put("fieldFilter", JSONObject().apply {
                        put("field", JSONObject().put("fieldPath", whereField))
                        put("op", "EQUAL")
                        put("value", JSONObject().put("stringValue", whereValue))
                    })
                })
                put("limit", 1000)
            })
        }
        val request = Request.Builder()
            .url("$baseUrl:runQuery")
            .header("Authorization", "Bearer $idToken")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()

        return try {
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val results = JSONArray(response.body?.string().orEmpty())
                (0 until results.length()).mapNotNull { i ->
                    val doc = results.optJSONObject(i)?.optJSONObject("document") ?: return@mapNotNull null
                    val name = doc.optString("name")
                    val id = name.substringAfterLast('/')
                    val fields = doc.optJSONObject("fields") ?: JSONObject()
                    id to fields
                }
            }
        } catch (e: IOException) {
            emptyList()
        }
    }

    /**
     * Creates a new document with an auto-generated ID. Returns that ID, or
     * null if the write failed (network error, or the caller isn't a
     * member of the businessId named in [fields] per firestore.rules --
     * same rule this app's own account already satisfies for its own
     * business on every other collection).
     */
    fun createDocument(collectionPath: String, fields: Map<String, Any?>, idToken: String): String? {
        val body = JSONObject().put("fields", fieldsToFirestoreValue(fields))
        val request = Request.Builder()
            .url("$baseUrl/$collectionPath")
            .header("Authorization", "Bearer $idToken")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()

        return try {
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val json = JSONObject(response.body?.string().orEmpty())
                json.optString("name").substringAfterLast('/').takeIf { it.isNotBlank() }
            }
        } catch (e: IOException) {
            null
        }
    }

    companion object {
        private fun stringValue(field: JSONObject?): String? =
            if (field != null && field.has("stringValue")) field.getString("stringValue") else null

        fun stringField(fields: JSONObject?, name: String): String? =
            stringValue(fields?.optJSONObject(name))

        fun booleanField(fields: JSONObject?, name: String, default: Boolean): Boolean =
            fields?.optJSONObject(name)?.let {
                if (it.has("booleanValue")) it.getBoolean("booleanValue") else default
            } ?: default

        fun stringArrayField(fields: JSONObject?, name: String): List<String> {
            val arrayValue = fields?.optJSONObject(name)?.optJSONObject("arrayValue") ?: return emptyList()
            val values = arrayValue.optJSONArray("values") ?: return emptyList()
            return (0 until values.length()).mapNotNull { i ->
                stringValue(values.optJSONObject(i))
            }
        }

        /** Wraps a plain Kotlin value (String/Boolean/Long/Int/Double/null) as a Firestore REST typed value. */
        private fun toFirestoreValue(value: Any?): JSONObject = JSONObject().apply {
            when (value) {
                null -> put("nullValue", JSONObject.NULL)
                is Boolean -> put("booleanValue", value)
                is Int -> put("integerValue", value.toString())
                is Long -> put("integerValue", value.toString())
                is Double -> put("doubleValue", value)
                else -> put("stringValue", value.toString())
            }
        }

        private fun fieldsToFirestoreValue(fields: Map<String, Any?>): JSONObject =
            JSONObject().apply { fields.forEach { (key, value) -> put(key, toFirestoreValue(value)) } }
    }
}
