package com.lomu.app.sync

import java.time.Instant
import java.time.ZoneId
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Sleep-with-the-queue-on detection, a port of web/src/lib/sleep.ts (same rules, so the phone and the PC agree).
 *
 * Falling asleep with the queue running leaves a clear trace in the play log: a long run of songs that each played to the
 * end, back to back, with no skip in between. The run starts at the last thing the user did on purpose and ends at the next
 * one. It is an estimate: people take a few minutes to nod off, and a long run can also be a work session.
 */
data class SleepPlay(
    val id: String, val title: String, val artist: String, val thumb: String?,
    val at: Long, val playedMs: Long, val completed: Boolean, val skipped: Boolean,
)

data class SleepSession(
    val start: Long,
    val end: Long,
    val plays: List<SleepPlay>,
    val asleepFrom: Long,
    val lastAwakeIndex: Int,
    val asleepMs: Long,
    val confidence: String, // "high" | "medium" | "low"
    val corrected: Boolean,
) {
    val lastAwake get() = plays[lastAwakeIndex]
}

private const val MIN = 60_000L
private const val MIN_RUN_MS = 75 * MIN
private const val MIN_RUN_SONGS = 10
private const val NODDING_OFF_MS = 15 * MIN

/** Is [b] the song that followed [a] on its own? Allows for buffering, and for logs stamped at the start or the end of a song. */
fun followsOn(a: SleepPlay, b: SleepPlay): Boolean {
    if (!a.completed || b.skipped) return false
    val delta = b.at - a.at
    if (delta <= 0) return false
    return abs(delta - a.playedMs) <= max(60_000.0, a.playedMs * 0.2) || abs(delta - b.playedMs) <= max(60_000.0, b.playedMs * 0.2)
}

/**
 * The phone's player may write several rows for one listen (each with the running total so far). Keep only the last row of each
 * burst, otherwise one song would look like several short ones and break every run.
 */
fun collapseRepeats(plays: List<SleepPlay>): List<SleepPlay> {
    val out = ArrayList<SleepPlay>()
    for (p in plays.sortedBy { it.at }) {
        val prev = out.lastOrNull()
        if (prev != null && prev.id == p.id && p.playedMs >= prev.playedMs && p.at - prev.at < 90_000 + (p.playedMs - prev.playedMs)) out[out.lastIndex] = p.copy(at = min(prev.at, p.at))
        else out.add(p)
    }
    return out
}

private fun isNight(t: Long): Boolean {
    val h = Instant.ofEpochMilli(t).atZone(ZoneId.systemDefault()).hour
    return h >= 21 || h < 9
}

/** Newest first. [anchors] maps a run's start time to the `at` of the song the user said was the last one they remember. */
fun detectSleep(history: List<SleepPlay>, anchors: Map<Long, Long> = emptyMap()): List<SleepSession> {
    val plays = collapseRepeats(history)
    val out = ArrayList<SleepSession>()
    var run = ArrayList<SleepPlay>()
    fun flush() {
        if (run.size >= MIN_RUN_SONGS) {
            val last = run.last()
            val start = run.first().at
            val end = last.at + last.playedMs
            if (end - start >= MIN_RUN_MS) out.add(session(run, start, end, anchors[start]))
        }
        run = ArrayList()
    }
    for (p in plays) {
        if (run.isNotEmpty() && followsOn(run.last(), p)) run.add(p) else { flush(); run.add(p) }
    }
    flush()
    return out.reversed()
}

private fun session(run: List<SleepPlay>, start: Long, end: Long, anchor: Long?): SleepSession {
    val span = end - start
    var idx = 0
    var asleepFrom = start + min(NODDING_OFF_MS, span / 4)
    var corrected = false
    if (anchor != null) {
        val i = run.indexOfFirst { it.at == anchor }
        if (i >= 0) { idx = i; asleepFrom = run[i].at + run[i].playedMs / 2; corrected = true }
    }
    if (!corrected) idx = run.indexOfFirst { it.at + it.playedMs >= asleepFrom }.coerceAtLeast(0)
    val overnight = isNight(start) || isNight(start + span / 2)
    val confidence = if (overnight && span >= 180 * MIN) "high" else if (overnight || span >= 120 * MIN) "medium" else "low"
    return SleepSession(start, end, run, asleepFrom, idx, max(0, end - asleepFrom), confidence, corrected)
}

/** "7h 20m", "45m". */
fun formatSpan(ms: Long): String {
    val m = Math.round(ms / MIN.toDouble())
    if (m < 60) return "${m}m"
    val h = m / 60
    return if (m % 60 != 0L) "${h}h ${m % 60}m" else "${h}h"
}
