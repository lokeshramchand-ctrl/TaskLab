package com.lomu.app.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.lazy.items
import com.lomu.app.sync.SleepPlay
import com.lomu.app.sync.Nap
import com.lomu.app.sync.SleepSession
import com.lomu.app.sync.napBetween
import com.lomu.app.sync.collapseRepeats
import com.lomu.app.sync.detectSleep
import com.lomu.app.sync.formatSpan
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/** The user's corrections (run start -> the song they remember last), kept on the phone. */
private fun loadAnchors(c: Context): Map<Long, Long> = runCatching {
    val o = JSONObject(c.getSharedPreferences("lomu_sleep", Context.MODE_PRIVATE).getString("anchors", null) ?: "{}")
    o.keys().asSequence().associate { it.toLong() to o.getLong(it) }
}.getOrDefault(emptyMap())

private fun saveAnchors(c: Context, m: Map<Long, Long>) {
    val o = JSONObject()
    m.forEach { (k, v) -> o.put(k.toString(), v) }
    c.getSharedPreferences("lomu_sleep", Context.MODE_PRIVATE).edit().putString("anchors", o.toString()).apply()
}

/** One selectable line in the nap picker: a queue (or history) song and, when it has been played, the play that gives it a time. */
private data class PickRow(val title: String, val artist: String, val play: SleepPlay?)

/** A nap the user calculated and kept. */
private data class SavedNap(val name: String, val from: Long, val to: Long, val betweenMs: Long, val wholeMs: Long, val songs: Int, val startTitle: String, val endTitle: String)

private fun loadNaps(c: Context): List<SavedNap> = runCatching {
    val a = org.json.JSONArray(c.getSharedPreferences("lomu_sleep", Context.MODE_PRIVATE).getString("naps", null) ?: "[]")
    (0 until a.length()).map { i ->
        val o = a.getJSONObject(i)
        SavedNap(o.getString("name"), o.getLong("from"), o.getLong("to"), o.getLong("between"), o.getLong("whole"), o.getInt("songs"), o.getString("startTitle"), o.getString("endTitle"))
    }
}.getOrDefault(emptyList())

private fun saveNaps(c: Context, l: List<SavedNap>) {
    val a = org.json.JSONArray()
    l.forEach { n -> a.put(JSONObject().put("name", n.name).put("from", n.from).put("to", n.to).put("between", n.betweenMs).put("whole", n.wholeMs).put("songs", n.songs).put("startTitle", n.startTitle).put("endTitle", n.endTitle)) }
    c.getSharedPreferences("lomu_sleep", Context.MODE_PRIVATE).edit().putString("naps", a.toString()).apply()
}

private fun clock(t: Long): String = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(t))
private fun day(t: Long): String = java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.getDefault()).format(Date(t))

/** The play log as sleep-detection input. */
@Composable
fun rememberPlays(): List<SleepPlay> {
    val player = LocalPlayer.current
    val plays by remember(player) {
        (player?.database?.events() ?: flowOf(emptyList())).map { list ->
            withContext(Dispatchers.Default) {
                list.map { e ->
                    val dur = e.song.song.duration * 1000L
                    val completed = dur > 0 && e.event.playTime >= dur * 0.85
                    SleepPlay(
                        e.song.song.id, e.song.song.title, e.song.artists.joinToString { it.name }, e.song.song.thumbnailUrl,
                        e.event.timestamp.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli(), e.event.playTime,
                        completed, !completed && e.event.playTime < 30_000,
                    )
                }
            }
        }
    }.collectAsState(emptyList())
    return plays
}

/** Auto-detected sleep runs, plus the user's corrections. Shared by the Sleep screen and the Home card. */
@Composable
fun rememberSleepSessions(anchors: Map<Long, Long>): List<SleepSession> {
    val plays = rememberPlays()
    return remember(plays, anchors) { detectSleep(plays, anchors) }
}

/** The most recent sleep with the queue on, whenever it was. For the Home card; older ones are on the Sleep screen. */
@Composable
fun lastSleep(): SleepSession? {
    val ctx = LocalContext.current
    return rememberSleepSessions(remember { loadAnchors(ctx) }).firstOrNull()
}

@Composable
fun SleepCard(s: SleepSession) {
    val lo = LocalLo.current
    val nav = LocalNav.current
    Row(
        Modifier.padding(horizontal = 20.dp, vertical = 8.dp).fillMaxWidth().background(lo.surface2, RoundedCornerShape(16.dp))
            .pressable(RoundedCornerShape(16.dp)) { nav.push(Screen.Sleep) }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Ic(Ph.Moon, 22.dp, lo.signal)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text("Last sleep · ~${formatSpan(s.asleepMs)} · ${day(s.end)}", style = LoType.sub.copy(fontWeight = FontWeight.SemiBold), color = lo.ink)
            Text("Dozed off around ${clock(s.asleepFrom)} during ${s.lastAwake.title}", style = LoType.small, color = lo.grey, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Ic(Ph.Right, 16.dp, lo.grey)
    }
}

@Composable
fun SleepScreen() {
    val lo = LocalLo.current
    val nav = LocalNav.current
    val ctx = LocalContext.current
    var anchors by remember { mutableStateOf(loadAnchors(ctx)) }
    val sessions = rememberSleepSessions(anchors).take(7)
    var open by remember { mutableIntStateOf(0) }
    val plays = rememberPlays()
    val recent = remember(plays) { collapseRepeats(plays).sortedByDescending { it.at }.take(150) }
    val player = LocalPlayer.current
    val windows by remember(player) { player?.queueWindows ?: flowOf(emptyList<androidx.media3.common.Timeline.Window>()) }.collectAsState(emptyList())
    // The time of a queue song comes from the play log: its most recent logged play.
    val newest = remember(plays) { collapseRepeats(plays).groupBy { it.id }.mapValues { e -> e.value.maxBy { it.at } } }
    var fromHistory by remember { mutableStateOf(false) }
    val rows = remember(windows, newest, recent, fromHistory) {
        if (fromHistory || windows.isEmpty()) recent.map { PickRow(it.title, it.artist, it) }
        else windows.map { w -> PickRow(w.mediaItem.mediaMetadata.title?.toString().orEmpty(), w.mediaItem.mediaMetadata.artist?.toString().orEmpty(), newest[w.mediaItem.mediaId]) }
    }
    var picking by remember { mutableStateOf(false) }
    var pickA by remember { mutableStateOf<Long?>(null) }
    var pickB by remember { mutableStateOf<Long?>(null) }
    var naps by remember { mutableStateOf(loadNaps(ctx)) }
    val usingQueue = !fromHistory && windows.isNotEmpty()
    val nap: Nap? = remember(plays, pickA, pickB) { if (pickA != null && pickB != null) napBetween(plays, pickA!!, pickB!!) else null }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottomPad())) {
        item { BackTitle("Library", "Sleep", nav::pop) }
        item {
            Text(
                "Worked out from songs that kept playing on their own after you stopped touching the phone. It is an estimate: tap the last song you remember hearing and it adjusts.",
                style = LoType.sub, color = lo.grey, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
        }
        // ---- Trip nap: pick the song you dozed off to and the one you woke up to; the play log gives the clock.
        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp).fillMaxWidth().background(lo.surface2, RoundedCornerShape(16.dp)).padding(16.dp)) {
                Text("Trip nap", style = LoType.title, color = lo.ink)
                Text(
                    if (!picking) "Pick the song you fell asleep to and the song you woke up to, from the queue that is playing now. LoMu works out how long that was."
                    else if (pickA == null) "Tap the song you were hearing when you fell asleep."
                    else if (pickB == null) "Now tap the song you woke up to."
                    else "Tap a song to start over.",
                    style = LoType.sub, color = lo.grey, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                )
                if (!picking) Pill("Calculate a nap", { picking = true; pickA = null; pickB = null }, accent = true, icon = Ph.Moon)
                else {
                    if (nap != null) {
                        Text("~${formatSpan(nap.betweenMs)} asleep", style = LoType.hero, color = lo.ink)
                        Text("between the two songs", style = LoType.small, color = lo.grey)
                        Text(
                            "Whole stretch ${formatSpan(nap.wholeMs)} · ${clock(nap.from)} – ${clock(nap.to)} · ${nap.songs.size} songs",
                            style = LoType.sub, color = lo.ink, modifier = Modifier.padding(top = 8.dp),
                        )
                        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Pill("Save", {
                                val n = SavedNap("Nap ${day(nap.from)}", nap.from, nap.to, nap.betweenMs, nap.wholeMs, nap.songs.size, nap.songs.first().title, nap.songs.last().title)
                                naps = listOf(n) + naps; saveNaps(ctx, naps); picking = false; pickA = null; pickB = null
                            }, accent = true)
                            Pill("Cancel", { picking = false; pickA = null; pickB = null }, filled = false)
                        }
                    } else Pill("Cancel", { picking = false; pickA = null; pickB = null }, filled = false)
                }
            }
        }
        if (picking) {
            item {
                Text(
                    if (usingQueue) "From your current queue (${rows.size} songs). Songs not played yet have no time and cannot be picked." else "From your listening history (no queue is loaded).",
                    style = LoType.small, color = lo.grey, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                )
                if (windows.isNotEmpty()) Text(
                    if (fromHistory) "Use the current queue instead" else "Use listening history instead", style = LoType.sub, color = lo.signal,
                    modifier = Modifier.pressable(RoundedCornerShape(8.dp)) { fromHistory = !fromHistory; pickA = null; pickB = null }.padding(horizontal = 20.dp, vertical = 6.dp),
                )
            }
            if (rows.isEmpty()) item { EmptyState(Ph.Moon, "Nothing to pick from", "Play some songs first, then come back to pick.") }
            items(rows.size, key = { "pick-$it" }) { i ->
                val r = rows[i]
                val p = r.play
                val lo2 = minOf(pickA ?: Long.MAX_VALUE, pickB ?: pickA ?: Long.MAX_VALUE)
                val hi2 = maxOf(pickA ?: Long.MIN_VALUE, pickB ?: pickA ?: Long.MIN_VALUE)
                val inRange = p != null && pickA != null && p.at in lo2..hi2
                val edge = p != null && (p.at == pickA || p.at == pickB)
                Row(
                    Modifier.fillMaxWidth().background(if (edge) lo.signalSoft else if (inRange) lo.surface2 else Color.Transparent)
                        .pressable(RoundedCornerShape(0.dp)) {
                            if (p != null) { if (pickA == null || pickB != null) { pickA = p.at; pickB = null } else pickB = p.at }
                        }
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (p != null) clock(p.at) else "--", style = LoType.small, color = lo.grey, modifier = Modifier.width(62.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.title, style = LoType.sub, color = if (p == null) lo.grey else lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (p == null) "not played yet" else r.artist, style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (edge) Text(if (p!!.at == minOf(pickA ?: p.at, pickB ?: p.at)) "start" else "end", style = LoType.small.copy(fontWeight = FontWeight.SemiBold), color = lo.signal)
                }
            }
        }
        if (naps.isNotEmpty() && !picking) {
            item { Text("Saved naps", style = LoType.section.copy(fontSize = 20.sp), color = lo.ink, modifier = Modifier.padding(start = 20.dp, top = 14.dp, bottom = 4.dp)) }
            naps.forEachIndexed { i, n ->
                item(key = "nap-" + n.from) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 5.dp).fillMaxWidth().background(lo.surface2, RoundedCornerShape(16.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("~${formatSpan(n.betweenMs)} asleep", style = LoType.title, color = lo.ink)
                            Text("${n.name} · ${clock(n.from)} – ${clock(n.to)} · ${n.songs} songs", style = LoType.small, color = lo.grey)
                            Text("${n.startTitle}  ->  ${n.endTitle}", style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text("Delete", style = LoType.sub, color = lo.signal, modifier = Modifier.pressable(RoundedCornerShape(8.dp)) { naps = naps.filterIndexed { j, _ -> j != i }; saveNaps(ctx, naps) }.padding(8.dp))
                    }
                }
            }
        }
        if (!picking && sessions.isEmpty()) item {
            EmptyState(Ph.Moon, "No sleep with music yet", "When you fall asleep with the queue playing, it shows up here the next morning.")
        }
        if (!picking) sessions.forEachIndexed { i, s ->
            item(key = s.start) {
                val on = open == i
                Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().background(lo.surface2, RoundedCornerShape(16.dp))) {
                    Row(
                        Modifier.fillMaxWidth().pressable(RoundedCornerShape(16.dp)) { open = if (on) -1 else i }.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("~${formatSpan(s.asleepMs)} asleep", style = LoType.title, color = lo.ink)
                            Text("${day(s.start)} · ${clock(s.asleepFrom)} – ${clock(s.end)} · ${s.plays.size} songs", style = LoType.small, color = lo.grey)
                        }
                        Text(
                            if (s.corrected) "set by you" else when (s.confidence) { "high" -> "likely"; "medium" -> "maybe"; else -> "unsure" },
                            style = LoType.small.copy(fontWeight = FontWeight.SemiBold), color = if (s.confidence == "high" || s.corrected) lo.signal else lo.grey,
                        )
                    }
                    if (on) {
                        Text(
                            "You probably nodded off around ${clock(s.asleepFrom)} during ${s.lastAwake.title}. The queue then played ${s.plays.size - s.lastAwakeIndex - 1} more songs until ${clock(s.end)}.",
                            style = LoType.sub, color = lo.ink, modifier = Modifier.padding(horizontal = 16.dp),
                        )
                        Text("Tap the last song you actually remember:", style = LoType.small, color = lo.grey, modifier = Modifier.padding(start = 16.dp, top = 10.dp, bottom = 4.dp))
                        s.plays.forEachIndexed { j, p ->
                            Row(
                                Modifier.fillMaxWidth()
                                    .background(if (j == s.lastAwakeIndex) lo.signalSoft else Color.Transparent)
                                    .pressable(RoundedCornerShape(0.dp)) { anchors = anchors + (s.start to p.at); saveAnchors(ctx, anchors) }
                                    .padding(horizontal = 16.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(clock(p.at), style = LoType.small, color = lo.grey, modifier = Modifier.width(62.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(p.title, style = LoType.sub, color = if (j > s.lastAwakeIndex) lo.grey else lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(p.artist, style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                if (j == s.lastAwakeIndex) Text("last awake", style = LoType.small.copy(fontWeight = FontWeight.SemiBold), color = lo.signal)
                            }
                        }
                        if (s.corrected) Text(
                            "Back to automatic estimate", style = LoType.sub, color = lo.signal,
                            modifier = Modifier.pressable(RoundedCornerShape(8.dp)) { anchors = anchors - s.start; saveAnchors(ctx, anchors) }.padding(16.dp),
                        )
                    }
                }
            }
        }
    }
}
