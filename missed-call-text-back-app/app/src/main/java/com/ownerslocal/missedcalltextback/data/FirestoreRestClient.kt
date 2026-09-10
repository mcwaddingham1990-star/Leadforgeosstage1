package com.ownerslocal.missedcalltextback.data

import com.ownerslocal.missedcalltextback.Config
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException

/**
 * Minimal Firestore REST client -- reads exactly the two documents this app
 * needs (user_profiles/{uid} and missed_call_settings/{businessId}), using
 * the same Firestore security rules the web app is already bound by (see
 * the main repo's firestore.rules): a request here succeeds or fails
 * exactly as it would for the web app signed in as the same user, since
 * both go through the same rule evaluation against the same ID token.
 */
class FirestoreRestClient(private val http: OkHttpClient) {

    /** Returns the document's "fields" object, or null if it doesn't exist or the request failed. */
    fun getDocumentFields(collectionPath: String, documentId: String, idToken: String): JSONObject? {
        val encodedId = java.net.URLEncoder.encode(documentId, "UTF-8")
        val url = "https://firestore.googleapis.com/v1/projects/${Config.FIREBASE_PROJECT_ID}" +
            "/databases/${Config.FIRESTORE_DATABASE_ID}/documents/$collectionPath/$encodedId"
        val request = Request.Builder()
            .url(url)
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
    }
}
