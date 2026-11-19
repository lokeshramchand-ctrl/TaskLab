package com.lomu.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.media3.common.MediaItem
import com.lomu.app.extensions.toMediaItem
import com.lomu.app.extensions.metadata
import com.lomu.app.lyrics.LyricsHelper
import com.lomu.app.models.MediaMetadata
import com.lomu.app.sync.ConnectClient
import com.lomu.app.models.toMediaMetadata
import com.lomu.app.playback.PlayerConnection
import com.lomu.app.playback.queues.ListQueue
import com.lomu.app.playback.queues.YouTubePlaylistQueue
import com.lomu.app.playback.queues.YouTubeQueue
import com.music.innertube.models.SongItem
import com.music.innertube.models.WatchEndpoint

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Err(val message: String) : Load<Nothing>
}

/** Runs [block] when [key] changes and exposes the outcome as state. */
@Composable
fun <T> load(key: Any?, block: suspend () -> Result<T>): State<Load<T>> =
    produceState<Load<T>>(Load.Loading, key) {
        value = Load.Loading
        value = block().fold({ Load.Ok(it) }, { Load.Err(it.message ?: "Something went wrong") })
    }

val LocalPlayer = staticCompositionLocalOf<PlayerConnection?> { null }
val LocalLyrics = staticCompositionLocalOf<LyricsHelper?> { null }
val LocalSync = staticCompositionLocalOf<com.lomu.app.sync.SyncClient?> { null }
val LocalNav = staticCompositionLocalOf<Nav> { error("no nav") }

/*
 * Every "play this" in the UI goes through these helpers. While this phone is steering another
 * device (see ConnectClient.remote) they send the songs there instead of playing locally.
 */
private fun remoteTarget(): Pair<ConnectClient, String>? =
    ConnectClient.instance?.let { c -> c.remote.value?.let { c to it.id } }

/** Play one song and let YouTube radio carry on after it. */
fun PlayerConnection.playRadio(song: SongItem) = playRadio(song.toMediaMetadata())

fun PlayerConnection.playRadio(m: MediaMetadata) {
    val r = remoteTarget()
    if (r != null) r.first.radioOn(r.second, m)
    else playQueue(YouTubeQueue(WatchEndpoint(videoId = m.id), m))
}

/** Play a list of songs in order starting at [index]. */
fun PlayerConnection.playList(title: String?, songs: List<SongItem>, index: Int = 0) {
    val r = remoteTarget()
    if (r != null) r.first.playOn(r.second, songs.map { it.toMediaMetadata() }, index)
    else playQueue(ListQueue(title = title, items = songs.map { it.toMediaItem() }, startIndex = index))
}

fun PlayerConnection.playMediaItems(title: String?, items: List<MediaItem>, index: Int = 0) {
    val r = remoteTarget()
    if (r != null) r.first.playOn(r.second, items.mapNotNull { it.metadata }, index)
    else playQueue(ListQueue(title = title, items = items, startIndex = index))
}

fun PlayerConnection.playPlaylist(id: String, title: String?, songs: List<SongItem>, continuation: String?, index: Int = 0) {
    val r = remoteTarget()
    if (r != null) r.first.playOn(r.second, songs.map { it.toMediaMetadata() }, index)
    else playQueue(YouTubePlaylistQueue(id, title, songs, continuation, index))
}

fun formatTime(ms: Long): String {
    if (ms <= 0) return "0:00"
    val s = ms / 1000
    return "%d:%02d".format(s / 60, s % 60)
}
