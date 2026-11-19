package com.lomu.app.sync

import android.content.Context
import com.lomu.app.db.MusicDatabase
import com.lomu.app.db.entities.Event
import com.lomu.app.constants.SongSortType
import com.lomu.app.models.MediaMetadata
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

data class SyncState(
    val serverUrl: String = "",
    val user: String? = null,
    val status: String = "Not signed in",
    val busy: Boolean = false,
    val error: String? = null,
)

/**
 * Talks to the LoMu server (the web app): sign-in with rotating tokens and incremental
 * document sync of likes and listening history. The wire format is shared with the web player
 * (see web/src/server/sync.ts).
 */
@Singleton
class SyncClient @Inject constructor(
    @ApplicationContext context: Context,
    private val database: MusicDatabase,
) {
    private val prefs = context.getSharedPreferences("lomu_sync", Context.MODE_PRIVATE)
    private val http = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
    private val json = "application/json".toMediaType()
    private val lock = Mutex()

    private val _state = MutableStateFlow(
        SyncState(
            serverUrl = prefs.getString("url", null) ?: com.lomu.app.BuildConfig.DEFAULT_SERVER_URL,
            user = prefs.getString("user", null),
            status = if (prefs.getString("refresh", null) != null) "Signed in" else "Not signed in",
        ),
    )
    val state: StateFlow<SyncState> = _state.asStateFlow()

    val signedIn get() = prefs.getString("refresh", null) != null

    private fun base() = (prefs.getString("url", null) ?: com.lomu.app.BuildConfig.DEFAULT_SERVER_URL).trimEnd('/')

    private fun post(path: String, body: JSONObject, auth: Boolean): Pair<Int, JSONObject> {
        val b = Request.Builder().url(base() + path).header("x-lomu-device", "android")
            .post(body.toString().toRequestBody(json))
        if (auth) prefs.getString("access", null)?.let { b.header("Authorization", "Bearer $it") }
        return http.newCall(b.build()).execute().use { r -> r.code to JSONObject(r.body?.string().orEmpty().ifBlank { "{}" }) }
    }

    private fun get(path: String): Pair<Int, JSONObject> {
        val b = Request.Builder().url(base() + path).header("x-lomu-device", "android")
        prefs.getString("access", null)?.let { b.header("Authorization", "Bearer $it") }
        return http.newCall(b.build()).execute().use { r -> r.code to JSONObject(r.body?.string().orEmpty().ifBlank { "{}" }) }
    }

    private fun saveTokens(o: JSONObject) {
        prefs.edit().putString("access", o.getString("access")).putString("refresh", o.getString("refresh")).apply()
    }

    private fun refresh(): Boolean {
        val rt = prefs.getString("refresh", null) ?: return false
        val (code, o) = post("/api/auth/refresh", JSONObject().put("refresh", rt), auth = false)
        if (code != 200) return false
        saveTokens(o)
        return true
    }

    /** GET/POST with one transparent token refresh on 401. */
    private fun call(block: () -> Pair<Int, JSONObject>): Pair<Int, JSONObject> {
        var r = block()
        if (r.first == 401 && refresh()) r = block()
        return r
    }

    /** Streaming GET for server-sent events (no timeouts, caller closes it). Renews the token once on 401. */
    fun openStream(path: String): okhttp3.Response {
        val c = http.newBuilder().callTimeout(0, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS).build()
        fun req() = Request.Builder().url(base() + path).header("x-lomu-device", "android").header("Accept", "text/event-stream")
            .apply { prefs.getString("access", null)?.let { header("Authorization", "Bearer $it") } }.build()
        var r = c.newCall(req()).execute()
        if (r.code == 401 && refresh()) { r.close(); r = c.newCall(req()).execute() }
        return r
    }

    /** Authenticated JSON POST that returns the HTTP status. */
    fun postAuthed(path: String, body: JSONObject): Int = call { post(path, body, auth = true) }.first

    /** Quick reachability check for the sign-in screen: asks the server who it is. */
    suspend fun ping(url: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val u = url.trim().trimEnd('/')
        if (!u.startsWith("https://") && !u.startsWith("http://")) return@withContext false to "Start the address with https://"
        try {
            val quick = http.newBuilder().callTimeout(10, TimeUnit.SECONDS).build()
            quick.newCall(Request.Builder().url("$u/api/auth/status").build()).execute().use { r ->
                val body = r.body?.string().orEmpty()
                if (r.code != 200) return@withContext false to "The server answered ${r.code}. Is this the LoMu address?"
                val o = JSONObject(body.ifBlank { "{}" })
                true to if (o.optBoolean("setup")) "Server is up. Sign in with your account." else "Server is up. Create your account (you need the setup code)."
            }
        } catch (e: Exception) {
            false to "Can't reach the server (${e.javaClass.simpleName}). Check the address and that you have internet."
        }
    }

    suspend fun signIn(url: String, user: String, password: String, create: Boolean) = withContext(Dispatchers.IO) {
        _state.value = _state.value.copy(busy = true, error = null, serverUrl = url)
        try {
            prefs.edit().putString("url", url.trim().trimEnd('/')).apply()
            val (code, o) = post(
                if (create) "/api/auth/setup" else "/api/auth/login",
                JSONObject().put("username", user).put("password", password),
                auth = false,
            )
            if (code != 200) {
                _state.value = _state.value.copy(busy = false, error = o.optString("error", "Sign-in failed ($code)"))
                return@withContext
            }
            saveTokens(o)
            prefs.edit().putString("user", user).putLong("seq", 0).apply()
            _state.value = _state.value.copy(busy = false, user = user, status = "Signed in")
        } catch (e: Exception) {
            _state.value = _state.value.copy(busy = false, error = "Can't reach the server: ${e.message}")
        }
    }

    fun signOut() {
        prefs.edit().remove("access").remove("refresh").remove("user").remove("seq").remove("liked").remove("lastEvent").apply()
        _state.value = _state.value.copy(user = null, status = "Not signed in", error = null)
    }

    /** Pull what other devices changed, then push our own changes. Safe to call often. */
    suspend fun sync() = lock.withLock {
        if (!signedIn) return@withLock
        withContext(Dispatchers.IO) {
            try {
                _state.value = _state.value.copy(status = "Syncing…")
                pull()
                push()
                _state.value = _state.value.copy(status = "Up to date · ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date())}", error = null)
            } catch (e: Exception) {
                _state.value = _state.value.copy(status = "Sync failed", error = e.message)
            }
        }
    }

    private suspend fun pull() {
        while (true) {
            val since = prefs.getLong("seq", 0)
            val (code, o) = call { get("/api/sync?since=$since") }
            if (code != 200) error("server said $code")
            val docs = o.getJSONArray("docs")
            if (docs.length() == 0) return
            for (i in 0 until docs.length()) apply(docs.getJSONObject(i))
            prefs.edit().putLong("seq", o.getLong("seq")).apply()
            if (docs.length() < 2000) return
        }
    }

    private suspend fun apply(d: JSONObject) {
        when (d.getString("kind")) {
            "like" -> {
                val deleted = d.optBoolean("deleted")
                val id = d.getString("key")
                val v = d.optJSONObject("value")
                database.withTransaction {
                    if (!deleted && v != null && song(id).first() == null) trackToMetadata(v.getJSONObject("track"))?.let { insert(it) }
                    val s = song(id).first()?.song ?: return@withTransaction
                    if (!deleted && !s.liked) update(s.copy(liked = true, likedDate = LocalDateTime.now(), inLibrary = s.inLibrary ?: LocalDateTime.now()))
                    if (deleted && s.liked) update(s.copy(liked = false, likedDate = null))
                }
            }
            "play" -> {
                if (d.optBoolean("deleted")) return
                val v = d.optJSONObject("value") ?: return
                val track = v.optJSONObject("track") ?: return
                val id = track.getString("id")
                database.withTransaction {
                    if (song(id).first() == null) trackToMetadata(track)?.let { insert(it) }
                    if (song(id).first() != null) {
                        val at = LocalDateTime.ofInstant(Instant.ofEpochMilli(v.getLong("at")), ZoneId.systemDefault())
                        insert(Event(songId = id, timestamp = at, playTime = v.optLong("playedMs")))
                    }
                }
            }
        }
    }

    private suspend fun push() {
        val docs = JSONArray()
        val now = System.currentTimeMillis()

        // Likes: diff against what the server last heard from us.
        val liked = database.likedSongs(SongSortType.CREATE_DATE, true).first()
        val likedIds = liked.map { it.song.id }.toSet()
        val before = prefs.getStringSet("liked", null)
        if (before == null || before != likedIds) {
            liked.filter { before == null || it.song.id !in before }.forEach { s ->
                val at = s.song.likedDate?.atZone(ZoneId.systemDefault())?.toInstant()?.toEpochMilli() ?: now
                docs.put(doc("like", s.song.id, JSONObject().put("track", songToTrack(s)).put("at", at), at, false))
            }
            before?.filter { it !in likedIds }?.forEach { docs.put(doc("like", it, null, now, true)) }
        }

        // Plays: events newer than the last one pushed.
        val lastEvent = prefs.getLong("lastEvent", 0)
        val events = database.events().first().filter { it.event.id > lastEvent }.sortedBy { it.event.id }.takeLast(2000)
        events.forEach { e ->
            val at = e.event.timestamp.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            val dur = e.song.song.duration * 1000L
            val completed = dur > 0 && e.event.playTime >= dur * 0.85
            val v = JSONObject().put("track", songToTrack(e.song)).put("at", at).put("playedMs", e.event.playTime)
                .put("completed", completed).put("skipped", !completed && e.event.playTime < 30_000)
            docs.put(doc("play", "$at:${e.song.song.id}", v, at, false))
        }
        if (docs.length() == 0) return

        val (code, o) = call { post("/api/sync", JSONObject().put("docs", docs), auth = true) }
        if (code != 200) error("push failed ($code)")
        // Our own writes are the next seq numbers; skip them so they are not pulled back.
        val seq = prefs.getLong("seq", 0)
        val edit = prefs.edit().putStringSet("liked", likedIds).putLong("lastEvent", events.lastOrNull()?.event?.id ?: lastEvent)
        if (o.optLong("seq") - seq == o.optLong("applied")) edit.putLong("seq", o.getLong("seq"))
        edit.apply()
    }

    data class RecShelf(val title: String, val subtitle: String?, val tracks: List<MediaMetadata>)

    /** Personalised shelves computed by the server from the synced listening history. */
    suspend fun recs(): List<RecShelf> = withContext(Dispatchers.IO) {
        if (!signedIn) return@withContext emptyList()
        val request = { Request.Builder().url(base() + "/api/recs").header("Authorization", "Bearer ${prefs.getString("access", "")}").build() }
        var r = http.newCall(request()).execute()
        if (r.code == 401 && refresh()) { r.close(); r = http.newCall(request()).execute() }
        r.use {
            if (it.code != 200) return@withContext emptyList()
            val arr = JSONArray(it.body?.string().orEmpty())
            (0 until arr.length()).map { i ->
                val sh = arr.getJSONObject(i)
                val items = sh.getJSONArray("items")
                RecShelf(
                    sh.getString("title"),
                    sh.optString("subtitle").ifBlank { null },
                    (0 until items.length()).mapNotNull { j -> trackToMetadata(items.getJSONObject(j)) },
                )
            }.filter { it.tracks.isNotEmpty() }
        }
    }

    private fun doc(kind: String, key: String, value: JSONObject?, updated: Long, deleted: Boolean) =
        JSONObject().put("kind", kind).put("key", key).put("value", value ?: JSONObject.NULL).put("updated", updated).put("deleted", deleted)

    fun metadataToTrack(m: MediaMetadata): JSONObject {
        val artists = JSONArray()
        m.artists.forEach { artists.put(JSONObject().put("id", it.id ?: JSONObject.NULL).put("name", it.name)) }
        val t = JSONObject().put("kind", "song").put("id", m.id).put("title", m.title).put("artists", artists)
        if (m.duration > 0) t.put("duration", m.duration)
        m.thumbnailUrl?.let { t.put("thumb", it) }
        m.album?.let { t.put("album", JSONObject().put("id", it.id).put("name", it.title)) }
        return t
    }

    private fun songToTrack(s: com.lomu.app.db.entities.Song): JSONObject {
        val artists = JSONArray()
        s.artists.forEach { artists.put(JSONObject().put("id", it.channelId ?: JSONObject.NULL).put("name", it.name)) }
        val t = JSONObject().put("kind", "song").put("id", s.song.id).put("title", s.song.title).put("artists", artists)
        if (s.song.duration > 0) t.put("duration", s.song.duration)
        s.song.thumbnailUrl?.let { t.put("thumb", it) }
        s.album?.let { t.put("album", JSONObject().put("id", it.id).put("name", it.title)) }
        return t
    }

    fun trackToMetadata(t: JSONObject): MediaMetadata? = runCatching {
        val artists = t.optJSONArray("artists") ?: JSONArray()
        val a = (0 until artists.length()).map { artists.getJSONObject(it) }
        MediaMetadata(
            id = t.getString("id"),
            title = t.getString("title"),
            artists = a.map { MediaMetadata.Artist(it.optString("id").ifBlank { null }.takeIf { id -> id != "null" }, it.getString("name")) },
            duration = t.optInt("duration", -1),
            thumbnailUrl = t.optString("thumb").ifBlank { null },
            album = t.optJSONObject("album")?.let { al -> al.optString("id").takeIf { it.isNotBlank() && it != "null" }?.let { MediaMetadata.Album(it, al.getString("name")) } },
        )
    }.getOrNull()
}
