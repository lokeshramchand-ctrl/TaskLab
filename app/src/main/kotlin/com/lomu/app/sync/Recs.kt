package com.lomu.app.sync

import com.lomu.app.models.MediaMetadata
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * On-device recommendation scoring. A direct port of web/src/server/recs-core.ts so the phone
 * builds the same shelves from its own play log and likes, with no server involved (the server
 * only has to supply the history from other devices, which sync already merges into the local
 * database). Pure functions, no I/O.
 */
data class PlayDoc(val track: MediaMetadata, val at: Long, val playedMs: Long, val completed: Boolean, val skipped: Boolean)
data class LikeDoc(val track: MediaMetadata, val at: Long)

class Affinity(
    val trackScore: Map<String, Double>,
    val artistScore: Map<String, Double>,
    val topTracks: List<MediaMetadata>,
    val onRepeat: List<MediaMetadata>,
    val heavilyPlayed: Set<String>,
    val skipped: Set<String>,
    val knownArtists: Set<String>,
    val favorites: List<MediaMetadata>,
)

private const val DAY = 86_400_000L
private fun decay(ageMs: Long, halfLifeDays: Double) = 0.5.pow(max(0L, ageMs).toDouble() / DAY / halfLifeDays)
private fun lead(t: MediaMetadata) = t.artists.firstOrNull()?.name?.lowercase().orEmpty()

fun affinity(plays: List<PlayDoc>, likes: List<LikeDoc>, now: Long): Affinity {
    val trackScore = HashMap<String, Double>()
    val artistScore = HashMap<String, Double>()
    val byId = HashMap<String, MediaMetadata>()
    val completions = HashMap<String, Int>()
    val recentSkips = HashMap<String, Int>()
    val monthPlays = LinkedHashMap<String, Int>()
    val likedIds = likes.map { it.track.id }.toSet()

    fun add(t: MediaMetadata, w: Double) {
        byId[t.id] = t
        trackScore[t.id] = (trackScore[t.id] ?: 0.0) + w
        for (a in t.artists) artistScore.merge(a.name.lowercase(), w * 0.5) { x, y -> x + y }
    }

    for (p in plays) {
        val age = now - p.at
        val d = decay(age, 14.0)
        when {
            p.completed -> {
                add(p.track, d)
                completions.merge(p.track.id, 1) { x, y -> x + y }
                if (age < 30 * DAY) monthPlays.merge(p.track.id, 1) { x, y -> x + y }
            }
            p.skipped -> {
                add(p.track, -1.2 * d)
                if (age < 21 * DAY) recentSkips.merge(p.track.id, 1) { x, y -> x + y }
            }
            else -> {
                // Further into the song is a stronger "yes"; flat 0.3 when the length is unknown.
                val dur = p.track.duration * 1000.0
                add(p.track, (if (dur > 0) min(0.7, max(0.1, p.playedMs / dur * 0.8)) else 0.3) * d)
            }
        }
    }
    for (l in likes) add(l.track, 2 * decay(now - l.at, 45.0))

    val ranked = trackScore.entries.filter { it.value > 0 }.sortedByDescending { it.value }
    val top = ArrayList<MediaMetadata>()
    val usedArtists = HashSet<String>()
    for ((id, _) in ranked) {
        val t = byId[id] ?: continue
        if (lead(t) in usedArtists && top.size < 3) continue // spread the first few seeds
        usedArtists.add(lead(t))
        top.add(t)
        if (top.size >= 12) break
    }

    val onRepeat = monthPlays.entries.sortedByDescending { it.value }.take(20).mapNotNull { byId[it.key] }

    val favorites = ranked.take(80).mapNotNull { byId[it.key] }

    return Affinity(
        trackScore, artistScore, top, onRepeat,
        heavilyPlayed = completions.filter { it.value >= 3 }.keys.toSet(),
        skipped = recentSkips.filter { it.value >= 1 && it.key !in likedIds }.keys.toSet(),
        knownArtists = artistScore.filter { it.value > 0 }.keys.toSet(),
        favorites = favorites,
    )
}

/** Consensus ranking: a candidate several strong seeds agree on beats one that appears once. */
fun rankCandidates(seeds: List<MediaMetadata>, cands: Map<String, List<MediaMetadata>>, aff: Affinity): List<MediaMetadata> {
    val score = HashMap<String, Double>()
    val byId = HashMap<String, MediaMetadata>()
    val seedIds = seeds.map { it.id }.toSet()
    seeds.forEachIndexed { si, seed ->
        val seedWeight = 1.0 / (1 + si * 0.25)
        val list = cands[seed.id].orEmpty()
        list.forEachIndexed { rank, t ->
            if (t.id in seedIds || t.id in aff.skipped || t.id in aff.heavilyPlayed) return@forEachIndexed
            byId[t.id] = t
            val positional = 1 - (rank.toDouble() / max(1, list.size)) * 0.5
            score.merge(t.id, seedWeight * positional) { x, y -> x + y }
        }
    }
    for ((id, s) in score.entries.toList()) {
        val t = byId[id] ?: continue
        val best = t.artists.maxOfOrNull { aff.artistScore[it.name.lowercase()] ?: 0.0 } ?: 0.0
        val boost = min(1.0, max(0.0, best) / 5)
        score[id] = s * (1 + 0.3 * boost)
    }
    return score.entries.sortedByDescending { it.value }.mapNotNull { byId[it.key] }
}

/** Keeps at most [cap] tracks per lead artist, preserving order. */
fun diversify(list: List<MediaMetadata>, cap: Int): List<MediaMetadata> {
    val seen = HashMap<String, Int>()
    val out = ArrayList<MediaMetadata>()
    for (t in list) {
        val a = lead(t)
        val n = seen[a] ?: 0
        if (a.isNotEmpty() && n >= cap) continue
        seen[a] = n + 1
        out.add(t)
    }
    return out
}

// ---- Daily mix (port of dailyMix in recs-core.ts): same three pools, same rhythm, deterministic per day.

fun dayKey(now: Long): String = java.time.Instant.ofEpochMilli(now).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString()

private fun rng(seed: String) = java.util.Random(seed.hashCode().toLong() * 2654435761L)

/** Picks [n] of [list], favouring the front but never in the same order two days running. */
private fun <T> pickWeighted(list: List<T>, n: Int, r: java.util.Random): List<T> =
    list.mapIndexed { i, t -> t to r.nextDouble().pow(1.0 / (1 + 1.5 / (1 + i * 0.15))) }
        .sortedByDescending { it.second }.take(n).map { it.first }

fun dailySeeds(top: List<MediaMetadata>, day: String, n: Int = 6): List<MediaMetadata> =
    if (top.size <= n) top else top.take(2) + pickWeighted(top.drop(2), n - 2, rng("seeds:$day"))

fun dailyMix(aff: Affinity, ranked: List<MediaMetadata>, day: String, size: Int = 40): List<MediaMetadata> {
    val r = rng("mix:$day")
    val familiar = pickWeighted(aff.favorites.filter { it.id !in aff.skipped }, (size * 0.35).toInt(), r)
    val fresh = ranked.filter { it.id !in aff.skipped }
    val known = fresh.filter { t -> t.artists.any { it.name.lowercase() in aff.knownArtists } }
    val unknown = fresh.filter { t -> t.artists.none { it.name.lowercase() in aff.knownArtists } }
    val used = familiar.map { it.id }.toMutableSet()
    fun take(src: List<MediaMetadata>, n: Int): List<MediaMetadata> {
        val out = ArrayList<MediaMetadata>()
        for (t in pickWeighted(src.filter { it.id !in used }, n * 2, r)) {
            if (out.size >= n) break
            used.add(t.id); out.add(t)
        }
        return out
    }
    val q = mapOf(
        'F' to familiar.toMutableList(),
        'K' to take(known, (size * 0.4).toInt()).toMutableList(),
        'D' to take(unknown, (size * 0.25).toInt()).toMutableList(),
        'S' to take(fresh, size).toMutableList(),
    )
    val rhythm = "FKFKD"
    val total = q.values.sumOf { it.size }
    val out = ArrayList<MediaMetadata>()
    var i = 0
    while (out.size < size && out.size < total && i < size * 4) {
        for (k in listOf(rhythm[i % rhythm.length], 'F', 'K', 'D', 'S')) {
            val list = q.getValue(k)
            val idx = list.indexOfFirst { out.isEmpty() || lead(it) != lead(out.last()) }
            if (idx < 0) continue
            out.add(list.removeAt(idx))
            break
        }
        i++
    }
    return out
}
