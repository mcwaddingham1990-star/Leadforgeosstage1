package com.ownerslocal.missedcalltextback.auth

import com.ownerslocal.missedcalltextback.Config
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

sealed class AuthResult {
    data class Success(val idToken: String, val refreshToken: String, val uid: String, val email: String) : AuthResult()
    data class Failure(val message: String) : AuthResult()
}

/**
 * Talks directly to Firebase Auth's REST endpoints (Identity Toolkit +
 * Secure Token) rather than the Firebase Android SDK -- avoids needing a
 * per-package google-services.json registered in the Firebase console for
 * this separate app, since these endpoints only need the project's already
 * -public web API key. This is the same key OwnersLOCAL's web app and
 * server already use (see the main repo's server/verifyAuth.ts, which
 * verifies tokens issued by this same flow).
 */
class FirebaseAuthClient(private val http: OkHttpClient) {
    private val jsonMedia = "application/json".toMediaType()

    fun signIn(email: String, password: String): AuthResult {
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
            put("returnSecureToken", true)
        }
        val request = Request.Builder()
            .url("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${Config.FIREBASE_API_KEY}")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()

        return try {
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    return AuthResult.Failure(friendlyAuthError(text))
                }
                val json = JSONObject(text)
                AuthResult.Success(
                    idToken = json.getString("idToken"),
                    refreshToken = json.getString("refreshToken"),
                    uid = json.getString("localId"),
                    email = json.optString("email", email)
                )
            }
        } catch (e: IOException) {
            AuthResult.Failure("Couldn't reach the server -- check your connection.")
        }
    }

    /**
     * Exchanges a stored refresh token for a fresh ID token. Firebase ID
     * tokens expire after an hour, and this background service can't pop a
     * login screen every hour, so every server call first goes through
     * this. Returns null on failure (e.g. the refresh token itself was
     * revoked) -- callers should fall back to prompting for sign-in again.
     */
    fun refreshIdToken(refreshToken: String): AuthResult.Success? {
        val formBody = "grant_type=refresh_token&refresh_token=$refreshToken"
            .toRequestBody("application/x-www-form-urlencoded".toMediaType())
        val request = Request.Builder()
            .url("https://securetoken.googleapis.com/v1/token?key=${Config.FIREBASE_API_KEY}")
            .post(formBody)
            .build()

        return try {
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val json = JSONObject(response.body?.string().orEmpty())
                AuthResult.Success(
                    idToken = json.getString("id_token"),
                    refreshToken = json.getString("refresh_token"),
                    uid = json.getString("user_id"),
                    email = ""
                )
            }
        } catch (e: IOException) {
            null
        }
    }

    private fun friendlyAuthError(rawBody: String): String {
        val code = try {
            JSONObject(rawBody).getJSONObject("error").getString("message")
        } catch (e: Exception) {
            "UNKNOWN_ERROR"
        }
        return when {
            code.startsWith("EMAIL_NOT_FOUND") || code.startsWith("INVALID_PASSWORD") || code.startsWith("INVALID_LOGIN_CREDENTIALS") ->
                "Incorrect email or password."
            code.startsWith("USER_DISABLED") -> "This account has been disabled."
            code.startsWith("TOO_MANY_ATTEMPTS_TRY_LATER") -> "Too many attempts -- try again later."
            else -> "Sign-in failed ($code)."
        }
    }
}
