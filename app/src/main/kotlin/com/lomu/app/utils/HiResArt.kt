package com.lomu.app.utils

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Highest-quality artwork for the full player.
 *
 * 1. The iTunes catalogue (official album art, up to 3000x3000), when a result clearly matches the song.
 * 2. Otherwise the YouTube artwork re-requested at 2160px (4K).
 *
 * Only the song title and artist names are sent to the iTunes Search API. Results (including misses) are cached for the session.
 */
object HiResArt {
    private val cache = HashMap<String, String?>()

    /** 4K fallback for any YouTube / Google artwork URL. */
    fun fallback(url: String?): String? = url?.resize(2160, 2160)

    suspend fun best(title: String, artists: List<String>, current: String?): String? {
        val key = "$title|${artists.joinToString(",")}".lowercase()
        val hit = synchronized(cache) { if (cache.containsKey(key)) cache[key] else Unit }
        if (hit != Unit) return (hit as String?) ?: fallback(current)
        val found = runCatching { withContext(Dispatchers.IO) { itunes(title, artists) } }.getOrNull()
        synchronized(cache) { cache[key] = found }
        return found ?: fallback(current)
    }

    private fun norm(s: String) = s.lowercase().replace(Regex("\\(.*?\\)|\\[.*?]|[^\\p{L}\\p{N} ]"), " ").replace(Regex("\\s+"), " ").trim()

    private fun itunes(title: String, artists: List<String>): String? {
        val t = norm(title)
        if (t.isBlank()) return null
        val term = URLEncoder.encode("$title ${artists.firstOrNull().orEmpty()}", "UTF-8")
        val conn = (URL("https://itunes.apple.com/search?media=music&entity=song&limit=8&term=$term").openConnection() as HttpURLConnection).apply {
            connectTimeout = 4000; readTimeout = 4000
        }
        try {
            val results = JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).optJSONArray("results") ?: return null
            val wanted = artists.map { norm(it) }.filter { it.isNotBlank() }
            for (i in 0 until results.length()) {
                val r = results.getJSONObject(i)
                val name = norm(r.optString("trackName"))
                val by = norm(r.optString("artistName"))
                val titleOk = name == t || name.startsWith(t) || t.startsWith(name)
                val artistOk = wanted.isEmpty() || wanted.any { a -> by.contains(a) || a.contains(by) }
                val art = r.optString("artworkUrl100")
                if (titleOk && artistOk && art.isNotBlank()) return art.replace(Regex("\\d+x\\d+bb"), "3000x3000bb")
            }
            return null
        } finally {
            conn.disconnect()
        }
    }
}
