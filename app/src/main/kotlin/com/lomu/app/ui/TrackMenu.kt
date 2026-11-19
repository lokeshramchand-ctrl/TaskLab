package com.lomu.app.ui

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.room.withTransaction
import com.lomu.app.constants.PlaylistSortType
import com.lomu.app.db.entities.PlaylistEntity
import com.lomu.app.extensions.toMediaItem
import com.lomu.app.models.MediaMetadata
import com.lomu.app.playback.queues.ListQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDateTime

/** A song the "…" menu was opened for. [onRemove] adds a "Remove from …" entry (playlist rows, queue rows). */
data class MenuTarget(val song: MediaMetadata, val removeLabel: String? = null, val onRemove: (() -> Unit)? = null)

/** Opens the song menu. Provided by the root so any row can offer it. */
val LocalTrackMenu = staticCompositionLocalOf<(MenuTarget) -> Unit> { {} }

/**
 * The song menu, as in Apple Music / Spotify: Play Next, Add to Queue, Start Radio, Like, Add to Playlist,
 * Go to Album / Artist, Share. While this phone steers another device the queue actions go to that device.
 */
@Composable
fun TrackMenuSheet(target: MenuTarget, onDismiss: () -> Unit, onNavigate: (Screen) -> Unit) {
    val lo = LocalLo.current
    val ctx = LocalContext.current
    val pc = LocalPlayer.current
    val connect = LocalConnect.current
    val sync = LocalSync.current
    val scope = rememberCoroutineScope()
    val m = target.song
    val db = pc?.database
    val songRow by remember(m.id) { db?.song(m.id) ?: flowOf(null) }.collectAsState(null)
    val remote by (connect?.remote ?: remember { kotlinx.coroutines.flow.MutableStateFlow(null) }).collectAsState()
    val playlistsFlow = remember(db) { db?.playlists(PlaylistSortType.CREATE_DATE, true) ?: flowOf(emptyList()) }
    val playlists by playlistsFlow.collectAsState(emptyList())
    val liked = songRow?.song?.liked == true
    var page by remember { mutableStateOf(0) } // 0 menu, 1 pick a playlist, 2 name a new playlist
    var name by remember { mutableStateOf("") }

    fun say(s: String) = Toast.makeText(ctx, s, Toast.LENGTH_SHORT).show()
    fun done(s: String? = null) { s?.let(::say); onDismiss() }

    fun enqueue(next: Boolean) {
        val r = remote
        if (r != null) connect?.enqueueOn(r.id, listOf(m), next)
        else if (pc != null) {
            val item = m.toMediaItem()
            when {
                pc.player.mediaItemCount == 0 -> pc.playQueue(ListQueue(null, listOf(item)))
                next -> pc.playNext(item)
                else -> pc.addToQueue(item)
            }
        }
        done(if (next) "Playing next" else "Added to queue")
    }

    fun toggleLike() {
        val d = db ?: return done()
        scope.launch(Dispatchers.IO) {
            d.withTransaction {
                insert(m)
                song(m.id).first()?.song?.let { s ->
                    val n = s.localToggleLike()
                    update(if (n.liked) n.copy(inLibrary = n.inLibrary ?: LocalDateTime.now()) else n)
                }
            }
            sync?.sync() // likes reach the other devices right away
        }
        done(if (liked) "Removed from Liked Songs" else "Added to Liked Songs")
    }

    fun addTo(pl: com.lomu.app.db.entities.Playlist) {
        val d = db ?: return done()
        scope.launch {
            var dup = false
            withContext(Dispatchers.IO) {
                d.withTransaction {
                    insert(m)
                    val exists = playlistDuplicates(pl.playlist.id, listOf(m.id)).isNotEmpty()
                    if (!exists) addSongToPlaylist(pl, listOf(m.id))
                    dup = exists
                }
            }
            done(if (dup) "Already in ${pl.playlist.name}" else "Added to ${pl.playlist.name}")
        }
    }

    fun createPlaylist() {
        val d = db ?: return done()
        val n = name.trim().ifBlank { return }
        scope.launch {
            withContext(Dispatchers.IO) {
                d.withTransaction {
                    val pl = PlaylistEntity(name = n, bookmarkedAt = LocalDateTime.now(), isLocal = true)
                    insert(pl)
                    insert(m)
                    insert(com.lomu.app.db.entities.PlaylistSongMap(playlistId = pl.id, songId = m.id, position = 0))
                }
            }
            done("Added to $n")
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss),
        Alignment.BottomCenter,
    ) {
        Column(
            Modifier.fillMaxWidth().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .background(lo.card, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)).navigationBarsPadding().padding(horizontal = 20.dp, vertical = 14.dp),
        ) {
            Box(Modifier.align(Alignment.CenterHorizontally).width(36.dp).height(5.dp).background(lo.grey.copy(alpha = 0.5f), RoundedCornerShape(3.dp)))
            Spacer(Modifier.height(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Cover(m.thumbnailUrl, 48.dp, radius = 6.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(m.title, style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(m.artists.joinToString(", ") { it.name }, style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.height(8.dp))
            Hairline()
            Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                when (page) {
                    0 -> {
                        MenuRow(Icons.Rounded.PlaylistPlay, "Play Next") { enqueue(true) }
                        MenuRow(Icons.Rounded.QueueMusic, "Add to Queue") { enqueue(false) }
                        MenuRow(Icons.Rounded.Radio, "Start Radio") { pc?.playRadio(m); done() }
                        MenuRow(if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, if (liked) "Remove from Liked Songs" else "Like", tint = if (liked) lo.signal else null) { toggleLike() }
                        MenuRow(Icons.Rounded.PlaylistAdd, "Add to Playlist…") { page = 1 }
                        m.album?.takeIf { it.id.isNotBlank() }?.let { a -> MenuRow(Icons.Rounded.Album, "Go to Album") { onNavigate(Screen.Album(a.id)); onDismiss() } }
                        val withIds = m.artists.filter { !it.id.isNullOrBlank() }.take(3)
                        withIds.forEach { a -> MenuRow(Icons.Rounded.Person, if (withIds.size > 1) "Go to ${a.name}" else "Go to Artist") { onNavigate(Screen.Artist(a.id!!)); onDismiss() } }
                        MenuRow(Icons.Rounded.Share, "Share") {
                            val send = Intent(Intent.ACTION_SEND).setType("text/plain")
                                .putExtra(Intent.EXTRA_TEXT, "${m.title} · ${m.artists.joinToString(", ") { it.name }}\nhttps://music.youtube.com/watch?v=${m.id}")
                            ctx.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            onDismiss()
                        }
                        target.onRemove?.let { rm -> MenuRow(Icons.Rounded.RemoveCircleOutline, target.removeLabel ?: "Remove", tint = lo.red) { rm(); done() } }
                    }
                    1 -> {
                        MenuRow(Icons.Rounded.ArrowBack, "Add to Playlist") { page = 0 }
                        MenuRow(Icons.Rounded.Add, "New Playlist…", tint = lo.signal) { page = 2 }
                        playlists.filter { it.playlist.isEditable }.forEach { pl ->
                            MenuRow(Icons.Rounded.QueueMusic, pl.playlist.name, sub = "${pl.songCount} songs") { addTo(pl) }
                        }
                    }
                    else -> {
                        MenuRow(Icons.Rounded.ArrowBack, "New Playlist") { page = 1 }
                        BasicTextField(
                            value = name, onValueChange = { name = it }, singleLine = true,
                            textStyle = LoType.body.copy(color = lo.ink), cursorBrush = SolidColor(lo.signal),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp).background(lo.surface2, RoundedCornerShape(10.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
                            decorationBox = { inner -> if (name.isEmpty()) Text("Playlist name", style = LoType.body, color = lo.grey); inner() },
                        )
                        Pill("Create", { createPlaylist() }, accent = true, modifier = Modifier.fillMaxWidth().height(48.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun MenuRow(icon: ImageVector, label: String, tint: Color? = null, sub: String? = null, onClick: () -> Unit) {
    val lo = LocalLo.current
    Row(Modifier.fillMaxWidth().pressable(RoundedCornerShape(12.dp), onClick = onClick).padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        IcV(icon, 24.dp, tint ?: lo.ink)
        Spacer(Modifier.width(18.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = LoType.body.copy(fontSize = 17.sp), color = tint ?: lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (sub != null) Text(sub, style = LoType.small, color = lo.grey)
        }
    }
}
