package com.lomu.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.Context
import android.media.AudioManager
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.animation.animateColorAsState
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.media3.common.Player
import com.lomu.app.lyrics.LyricsEntry
import com.lomu.app.lyrics.LyricsUtils
import com.lomu.app.extensions.metadata
import com.lomu.app.models.MediaMetadata
import com.lomu.app.playback.PlayerConnection
import kotlinx.coroutines.delay

/** Pushes an artwork colour to a rich, saturated mid-dark tone so the player wash is strong but white text stays readable. */
private fun playerTint(c: Color?): Color? {
    c ?: return null
    val hsv = FloatArray(3)
    android.graphics.Color.colorToHSV(android.graphics.Color.argb(255, (c.red * 255).toInt(), (c.green * 255).toInt(), (c.blue * 255).toInt()), hsv)
    hsv[1] = hsv[1].coerceAtLeast(0.6f)
    hsv[2] = hsv[2].coerceIn(0.5f, 0.78f)
    return Color(android.graphics.Color.HSVToColor(hsv))
}

private fun MediaMetadata.artistLine() = artists.joinToString(", ") { it.name }

/** Floating glass capsule above the tab bar: 32dp cover, two lines of text, play / pause and skip. */
@Composable
fun MiniPlayer(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    val pc = LocalPlayer.current ?: return
    val meta by pc.mediaMetadata.collectAsState()
    val playing by pc.isPlaying.collectAsState()
    val m = meta ?: return
    val shape = RoundedCornerShape(32.dp)
    Row(
        modifier.fillMaxWidth().height(52.dp).glass(shape, lo).pressable(shape, onClick = onOpen).padding(start = 10.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(m.thumbnailUrl, 34.dp, radius = 8.dp)
        Spacer(Modifier.width(10.dp))
        AnimatedContent(
            targetState = m,
            contentKey = { it.id },
            transitionSpec = { (fadeIn(tween(260, delayMillis = 60)) + slideInVertically(tween(320, easing = IosEase)) { it / 3 }) togetherWith (fadeOut(tween(120)) + slideOutVertically(tween(200)) { -it / 3 }) },
            modifier = Modifier.weight(1f),
            label = "miniTitle",
        ) { song ->
            Column {
                Text(song.title, style = LoType.sub.copy(fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp), color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(song.artistLine(), style = LoType.small.copy(fontSize = 11.sp, lineHeight = 13.sp, fontWeight = FontWeight.Medium), color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        PlayPauseBtn(playing, { pc.togglePlayPause() }, size = 44.dp, iconSize = 28.dp)
        IconBtnV(Icons.Rounded.FastForward, { pc.seekToNext() }, size = 44.dp, iconSize = 28.dp)
    }
}

/** The player is always dark with white controls over the tinted artwork, in both themes. */
@Composable
fun FullPlayer(onClose: () -> Unit) = CompositionLocalProvider(LocalLo provides DarkLo) { FullPlayerContent(onClose) }

@Composable
private fun FullPlayerContent(onClose: () -> Unit) {
    val lo = LocalLo.current
    val pc = LocalPlayer.current ?: return
    val meta by pc.mediaMetadata.collectAsState()
    val playing by pc.isPlaying.collectAsState()
    val shuffle by pc.shuffleModeEnabled.collectAsState()
    val repeat by pc.repeatMode.collectAsState()
    val song by pc.currentSong.collectAsState(null)
    val m = meta
    var mode by remember { mutableStateOf(0) } // 0 artwork, 1 lyrics, 2 playing next
    val liked = song?.song?.liked == true
    val openMenu = LocalTrackMenu.current
    val haptic = rememberHaptic()
    val sub = lo.grey

    val (dragY, dragMod) = rememberDismissDrag(onClose)
    Box(Modifier.fillMaxSize().graphicsLayer { translationY = dragY.value; alpha = 1f - (dragY.value / (size.height * 2f)).coerceIn(0f, 0.4f) }.background(lo.bg)) {
        // Strong colour wash taken from the artwork; it cross-fades slowly when the song changes.
        val tint by animateColorAsState(playerTint(rememberTint(m?.thumbnailUrl)) ?: lo.bg, tween(900), label = "playerTint")
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to tint, 0.55f to tint.copy(alpha = 0.55f).compositeOver(lo.bg), 1f to lo.bg)))
        Ambient(m?.thumbnailUrl, height = 900.dp, strength = 0.5f)
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp)) {
            // grabber
            // The bar at the top: tap or pull down to close. The hit area is much taller than the bar itself.
            Box(Modifier.fillMaxWidth().height(52.dp).then(dragMod).pressable(RoundedCornerShape(4.dp), onClick = onClose), Alignment.Center) {
                Box(Modifier.width(36.dp).height(5.dp).background(sub.copy(alpha = 0.6f), RoundedCornerShape(3.dp)))
            }
            Spacer(Modifier.height(4.dp))
            if (mode == 2) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Cover(m?.thumbnailUrl, 48.dp, radius = 5.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(m?.title ?: "Nothing playing", style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(m?.artistLine().orEmpty(), style = LoType.sub, color = sub, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Playing Next", style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = lo.ink, modifier = Modifier.weight(1f))
                    ToggleChip(Icons.Rounded.Shuffle, shuffle) { pc.player.shuffleModeEnabled = !pc.player.shuffleModeEnabled }
                    Spacer(Modifier.width(8.dp))
                    ToggleChip(if (repeat == Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, repeat != Player.REPEAT_MODE_OFF) {
                        pc.player.repeatMode = when (pc.player.repeatMode) {
                            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                            else -> Player.REPEAT_MODE_OFF
                        }
                    }
                }
                Box(Modifier.weight(1f).fillMaxWidth()) { QueuePanel(pc) }
            } else {
                Box(Modifier.weight(1f).fillMaxWidth().then(if (mode == 0) dragMod else Modifier), Alignment.Center) {
                    if (mode == 0) Artwork(m?.thumbnailUrl, playing, tint) else LyricsPanel(pc, m)
                }
                Spacer(Modifier.height(18.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(m?.title ?: "Nothing playing", style = LoType.title.copy(fontSize = 21.sp, lineHeight = 26.sp), color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(m?.artistLine().orEmpty(), style = LoType.body.copy(fontSize = 19.sp, lineHeight = 24.sp), color = sub, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Box(Modifier.size(32.dp).background(sub.copy(alpha = 0.25f), CircleShape).pressable(CircleShape) { haptic(true); pc.toggleLike() }, Alignment.Center) {
                        HeartPop(liked, 18.dp, on = lo.signal, off = lo.ink)
                    }
                    if (m != null) {
                        Spacer(Modifier.width(10.dp))
                        Box(Modifier.size(32.dp).background(sub.copy(alpha = 0.25f), CircleShape).pressable(CircleShape) { openMenu(MenuTarget(m)) }, Alignment.Center) {
                            Ic(Ph.More, 18.dp, lo.ink)
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            SeekBar(pc)
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                IconBtnV(Icons.Rounded.FastRewind, { pc.seekToPrevious() }, size = 72.dp, iconSize = 52.dp)
                PlayPauseBtn(playing, { pc.togglePlayPause() }, size = 84.dp, iconSize = 64.dp)
                IconBtnV(Icons.Rounded.FastForward, { pc.seekToNext() }, size = 72.dp, iconSize = 52.dp)
            }
            VolumeBar()
            Row(Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 14.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                IconBtnV(Icons.Rounded.ChatBubbleOutline, { mode = if (mode == 1) 0 else 1 }, size = 48.dp, iconSize = 24.dp, tint = if (mode == 1) lo.signal else sub)
                IconBtnV(Icons.Rounded.Devices, LocalOpenDevices.current, size = 48.dp, iconSize = 24.dp, tint = sub)
                IconBtnV(Icons.Rounded.FormatListBulleted, { mode = if (mode == 2) 0 else 2 }, size = 48.dp, iconSize = 24.dp, tint = if (mode == 2) lo.signal else sub)
            }
        }
    }
}

@Composable
private fun ToggleChip(icon: ImageVector, on: Boolean, onClick: () -> Unit) {
    val lo = LocalLo.current
    Box(Modifier.size(width = 36.dp, height = 28.dp).background(if (on) lo.signal else lo.grey.copy(alpha = 0.25f), RoundedCornerShape(7.dp)).pressable(RoundedCornerShape(7.dp), onClick = onClick), Alignment.Center) {
        IcV(icon, 18.dp, if (on) Color.White else lo.ink)
    }
}

/** Big square artwork that gently shrinks while paused, with a soft drop shadow. */
@Composable
private fun Artwork(url: String?, playing: Boolean, glow: Color) {
    val scale by animateFloatAsState(if (playing) 1f else 0.86f, spring(dampingRatio = 0.7f, stiffness = 300f), label = "art")
    BoxWithConstraints(Modifier.fillMaxSize(), Alignment.Center) {
        val side = minOf(maxWidth, maxHeight)
        // Coloured glow behind the cover, then the cover itself.
        Box(Modifier.size(side * 0.86f).graphicsLayer { scaleX = scale; scaleY = scale; translationY = 24f }.blur(48.dp).background(glow.copy(alpha = 0.85f), RoundedCornerShape(40.dp)))
        Box(Modifier.size(side).graphicsLayer { scaleX = scale; scaleY = scale }.coverShadow(14.dp, 24.dp)) { Cover(url, side, radius = 14.dp) }
    }
}

/** Thin progress line with a small knob and elapsed / remaining times. */
@Composable
private fun SeekBar(pc: PlayerConnection) {
    val lo = LocalLo.current
    var pos by remember { mutableStateOf(0L) }
    var dur by remember { mutableStateOf(0L) }
    var dragging by remember { mutableStateOf(false) }
    var drag by remember { mutableStateOf(0f) }
    LaunchedEffect(pc) {
        while (true) {
            if (!dragging) {
                pos = pc.player.currentPosition
                dur = pc.player.duration.coerceAtLeast(0L)
            }
            delay(300)
        }
    }
    val knob by animateDpAsState(if (dragging) 18.dp else 10.dp, spring(dampingRatio = 0.6f, stiffness = 500f), label = "knob")
    val thick by animateDpAsState(if (dragging) 8.dp else 4.dp, spring(stiffness = 600f), label = "thick")
    val frac = if (dragging) drag else if (dur > 0) (pos.toFloat() / dur).coerceIn(0f, 1f) else 0f
    val shown = if (dragging) (drag * dur).toLong() else pos
    Column {
        BoxWithConstraints(
            Modifier.fillMaxWidth().height(22.dp)
                .pointerInput(dur) {
                    detectTapGestures { o -> if (dur > 0) pc.seekTo((o.x / size.width * dur).toLong().coerceIn(0, dur)) }
                }
                .pointerInput(dur) {
                    detectHorizontalDragGestures(
                        onDragStart = { o -> dragging = true; drag = (o.x / size.width).coerceIn(0f, 1f) },
                        onDragEnd = { pc.seekTo((drag * dur).toLong()); dragging = false },
                        onDragCancel = { dragging = false },
                    ) { change, _ -> drag = (change.position.x / size.width).coerceIn(0f, 1f) }
                },
            Alignment.CenterStart,
        ) {
            Box(Modifier.fillMaxWidth().height(thick).background(lo.grey.copy(alpha = 0.3f), CircleShape))
            Box(Modifier.fillMaxWidth(frac).height(thick).background(lo.ink.copy(alpha = 0.85f), CircleShape))
            Box(Modifier.offset(x = (maxWidth - knob) * frac).size(knob).background(lo.ink, CircleShape))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(formatTime(shown), style = LoType.caption.copy(fontSize = 11.sp), color = lo.grey)
            Text("-" + formatTime((dur - shown).coerceAtLeast(0)), style = LoType.caption.copy(fontSize = 11.sp), color = lo.grey)
        }
    }
}

/** The phone's media volume (0..1), kept current while the hardware buttons or the system slider change it. */
@Composable
fun rememberSystemVolume(audio: AudioManager, max: Int): State<Float> {
    val ctx = LocalContext.current
    val vol = remember { mutableStateOf(audio.getStreamVolume(AudioManager.STREAM_MUSIC) / max.toFloat()) }
    DisposableEffect(ctx) {
        val read = { vol.value = audio.getStreamVolume(AudioManager.STREAM_MUSIC) / max.toFloat() }
        read()
        val receiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(c: Context?, i: android.content.Intent?) = read()
        }
        androidx.core.content.ContextCompat.registerReceiver(ctx, receiver, android.content.IntentFilter("android.media.VOLUME_CHANGED_ACTION"), androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED)
        val observer = object : android.database.ContentObserver(android.os.Handler(android.os.Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) = read()
        }
        ctx.contentResolver.registerContentObserver(android.provider.Settings.System.CONTENT_URI, true, observer)
        onDispose {
            runCatching { ctx.unregisterReceiver(receiver) }
            ctx.contentResolver.unregisterContentObserver(observer)
        }
    }
    return vol
}

/** System media volume with speaker glyphs at each end. */
@Composable
private fun VolumeBar() {
    val lo = LocalLo.current
    val ctx = LocalContext.current
    val audio = remember { ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    val max = remember { audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1) }
    // The slider is the phone's media volume: it moves with the hardware buttons and moves them back.
    val system by rememberSystemVolume(audio, max)
    var touched by remember { mutableStateOf<Float?>(null) }
    LaunchedEffect(system) { touched?.let { if (kotlin.math.abs(system - it) < 0.08f) touched = null } }
    val vol = touched ?: system
    val vKnob by animateDpAsState(if (touched != null) 18.dp else 10.dp, spring(dampingRatio = 0.6f, stiffness = 500f), label = "vknob")
    fun set(x: Float, w: Int) {
        val v = (x / w).coerceIn(0f, 1f)
        touched = v
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(v * max), 0)
    }
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        IcV(Icons.Rounded.VolumeMute, 16.dp, lo.grey)
        BoxWithConstraints(
            Modifier.weight(1f).height(26.dp).padding(horizontal = 10.dp)
                .pointerInput(Unit) { detectTapGestures { o -> set(o.x, size.width) } }
                .pointerInput(Unit) { detectHorizontalDragGestures { change, _ -> set(change.position.x, size.width) } },
            Alignment.CenterStart,
        ) {
            Box(Modifier.fillMaxWidth().height(4.dp).background(lo.grey.copy(alpha = 0.3f), CircleShape))
            Box(Modifier.fillMaxWidth(vol).height(4.dp).background(lo.ink.copy(alpha = 0.85f), CircleShape))
            Box(Modifier.offset(x = (maxWidth - vKnob) * vol).size(vKnob).background(lo.ink, CircleShape))
        }
        IcV(Icons.Rounded.VolumeUp, 16.dp, lo.grey)
    }
}

@Composable
private fun LyricsPanel(pc: PlayerConnection, m: MediaMetadata?) {
    val lo = LocalLo.current
    val helper = LocalLyrics.current
    val state by load(m?.id) {
        if (m == null || helper == null) Result.success(emptyList<LyricsEntry>())
        else runCatching { LyricsUtils.parseLyrics(helper.getLyrics(m).lyrics) }
    }
    var pos by remember { mutableStateOf(0L) }
    LaunchedEffect(pc) { while (true) { pos = pc.player.currentPosition; delay(200) } }
    when (val st = state) {
        is Load.Loading -> Loading()
        is Load.Err -> EmptyState(Ph.Lyrics, "No lyrics found")
        is Load.Ok -> {
            val lines = st.value
            if (lines.isEmpty()) EmptyState(Ph.Lyrics, "No lyrics found", "Lyrics appear here when a synced version exists.")
            else {
                val current = lines.indexOfLast { it.time <= pos }.coerceAtLeast(0)
                val listState = rememberLazyListState()
                LaunchedEffect(current) { listState.animateScrollToItem((current - 2).coerceAtLeast(0)) }
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    itemsIndexed(lines) { i, l ->
                        Text(
                            l.text.ifBlank { "♪" },
                            style = LoType.title.copy(fontSize = 28.sp, lineHeight = 34.sp),
                            color = if (i == current) lo.ink else lo.grey.copy(alpha = 0.55f),
                            textAlign = TextAlign.Start,
                            modifier = Modifier.fillMaxWidth().pressable(RoundedCornerShape(10.dp)) { pc.seekTo(l.time) }.padding(vertical = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun QueuePanel(pc: PlayerConnection) {
    val windows by pc.queueWindows.collectAsState()
    val index by pc.currentMediaItemIndex.collectAsState()
    if (windows.isEmpty()) { EmptyState(Ph.Queue, "Queue is empty"); return }
    val listState = rememberLazyListState()
    LaunchedEffect(index) { listState.scrollToItem((index - 1).coerceAtLeast(0)) }
    LazyColumn(Modifier.fillMaxSize(), state = listState) {
        itemsIndexed(windows) { i, w ->
            val md = w.mediaItem.mediaMetadata
            val meta = w.mediaItem.metadata
            MediaRow(
                md.title?.toString().orEmpty(), md.artist?.toString().orEmpty(), md.artworkUri?.toString(), active = i == index, pad = 0.dp,
                menu = meta?.let { MenuTarget(it, if (i == index) null else "Remove from Queue", if (i == index) null else ({ pc.player.removeMediaItem(i) })) },
            ) { pc.player.seekToDefaultPosition(i) }
        }
    }
}
