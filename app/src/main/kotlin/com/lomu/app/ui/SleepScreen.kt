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
import com.lomu.app.sync.SleepPlay
import com.lomu.app.sync.SleepSession
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

private fun clock(t: Long): String = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(t))
private fun day(t: Long): String = java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.getDefault()).format(Date(t))

/** The play log as sleep-detection input, plus the user's corrections. Shared by the Sleep screen and the Home card. */
@Composable
fun rememberSleepSessions(anchors: Map<Long, Long>): List<SleepSession> {
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

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottomPad())) {
        item { BackTitle("Library", "Sleep", nav::pop) }
        item {
            Text(
                "Worked out from songs that kept playing on their own after you stopped touching the phone. It is an estimate: tap the last song you remember hearing and it adjusts.",
                style = LoType.sub, color = lo.grey, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
        }
        if (sessions.isEmpty()) item {
            EmptyState(Ph.Moon, "No sleep with music yet", "When you fall asleep with the queue playing, it shows up here the next morning.")
        }
        sessions.forEachIndexed { i, s ->
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
