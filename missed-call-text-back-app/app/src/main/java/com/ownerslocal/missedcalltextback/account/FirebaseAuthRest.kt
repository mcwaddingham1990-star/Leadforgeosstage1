package com.ownerslocal.missedcalltextback.account

import com.ownerslocal.missedcalltextback.Config
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

data class AuthTokens(
    val uid: String,
    val email: String,
    val idToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long
)

sealed class AuthResult {
    data class Ok(val tokens: AuthTokens) : AuthResult()
    /** [revoked] means the refresh token is dead and the user must sign in again. */
    data class Failed(val message: String, val revoked: Boolean = false) : AuthResult()
}

/**
 * Firebase Auth over its REST API (Identity Toolkit + Secure Token), so this
 * separate package needs no google-services.json registration.
 */
class FirebaseAuthRest(private val http: OkHttpClient) {
    private val json = "application/json".toMediaType()
    private val identityBase = "https://identitytoolkit.googleapis.com/v1/accounts"

    fun signIn(email: String, password: String): AuthResult =
        passwordCall("signInWithPassword", email, password)

    /** For standalone accounts (not exposed in the UI until they launch). */
    fun signUp(email: String, password: String): AuthResult =
        passwordCall("signUp", email, password)

    private fun passwordCall(endpoint: String, email: String, password: String): AuthResult {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("returnSecureToken", true)
        val request = Request.Builder()
            .url("$identityBase:$endpoint?key=${Config.FIREBASE_API_KEY}")
            .post(body.toString().toRequestBody(json))
            .build()
        return try {
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) return AuthResult.Failed(friendlyError(text))
                val obj = JSONObject(text)
                AuthResult.Ok(
                    AuthTokens(
                        uid = obj.getString("localId"),
                        email = obj.optString("email", email),
                        idToken = obj.getString("idToken"),
                        refreshToken = obj.getString("refreshToken"),
                        expiresAtMillis = expiry(obj.optString("expiresIn", "3600"))
                    )
                )
            }
        } catch (e: IOException) {
            AuthResult.Failed("Couldn't reach the server. Check your connection.")
        } catch (e: org.json.JSONException) {
            AuthResult.Failed("Unexpected response from the sign-in server.")
        }
    }

    fun refresh(refreshToken: String, email: String): AuthResult {
        val request = Request.Builder()
            .url("https://securetoken.googleapis.com/v1/token?key=${Config.FIREBASE_API_KEY}")
            .post(
                FormBody.Builder()
                    .add("grant_type", "refresh_token")
                    .add("refresh_token", refreshToken)
                    .build()
            )
            .build()
        return try {
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    // 400 = token revoked/expired/user disabled; anything else is transient.
                    return AuthResult.Failed(friendlyError(text), revoked = response.code == 400)
                }
                val obj = JSONObject(text)
                AuthResult.Ok(
                    AuthTokens(
                        uid = obj.getString("user_id"),
                        email = email,
                        idToken = obj.getString("id_token"),
                        refreshToken = obj.getString("refresh_token"),
                        expiresAtMillis = expiry(obj.optString("expires_in", "3600"))
                    )
                )
            }
        } catch (e: IOException) {
            AuthResult.Failed("Couldn't reach the server.")
        } catch (e: org.json.JSONException) {
            AuthResult.Failed("Unexpected response from the sign-in server.")
        }
    }

    private fun expiry(expiresInSeconds: String): Long =
        System.currentTimeMillis() + (expiresInSeconds.toLongOrNull() ?: 3600L) * 1000L

    private fun friendlyError(rawBody: String): String {
        val code = try {
            JSONObject(rawBody).getJSONObject("error").getString("message")
        } catch (e: Exception) {
            "UNKNOWN_ERROR"
        }
        return when {
            code.startsWith("EMAIL_NOT_FOUND") || code.startsWith("INVALID_PASSWORD") ||
                code.startsWith("INVALID_LOGIN_CREDENTIALS") -> "Incorrect email or password."
            code.startsWith("INVALID_EMAIL") -> "That email address isn't valid."
            code.startsWith("EMAIL_EXISTS") -> "An account with that email already exists."
            code.startsWith("WEAK_PASSWORD") -> "Password must be at least 6 characters."
            code.startsWith("USER_DISABLED") -> "This account has been disabled."
            code.startsWith("TOO_MANY_ATTEMPTS_TRY_LATER") -> "Too many attempts. Try again later."
            code.startsWith("TOKEN_EXPIRED") || code.startsWith("INVALID_REFRESH_TOKEN") ||
                code.startsWith("USER_NOT_FOUND") -> "Your session expired. Please sign in again."
            else -> "Sign-in failed ($code)."
        }
    }
}
