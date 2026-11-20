package com.lomu.app.ui

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import com.lomu.app.models.toMediaMetadata
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronLeft
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.compositionLocalOf
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.toBitmap
import androidx.palette.graphics.Palette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.music.innertube.models.AlbumItem
import com.music.innertube.models.ArtistItem
import com.music.innertube.models.PlaylistItem
import com.music.innertube.models.SongItem
import com.music.innertube.models.YTItem

// ---------- primitives ----------

@Composable
fun Ic(icon: Ph, size: Dp = 22.dp, tint: Color = LocalLo.current.ink, modifier: Modifier = Modifier) {
    Icon(icon.vector, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

/** Material vector flavour of [Ic]; the filled and rounded glyphs read closest to SF Symbols. */
@Composable
fun IcV(icon: ImageVector, size: Dp = 22.dp, tint: Color = LocalLo.current.ink, modifier: Modifier = Modifier) {
    Icon(icon, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

/** Clickable with a soft spring "press" so every tap has feedback. */
fun Modifier.pressable(shape: Shape = RoundedCornerShape(10.dp), enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, spring(dampingRatio = 0.65f, stiffness = 600f), label = "press")
    val fade by animateFloatAsState(if (pressed) 0.72f else 1f, label = "pressFade")
    this
        .graphicsLayer { scaleX = scale; scaleY = scale; alpha = fade }
        .clip(shape)
        .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
}

/** A round glyph button. [filled] gives the solid accent button, [bordered] a translucent chip for floating over art. */
@Composable
fun IconBtn(
    icon: Ph, onClick: () -> Unit, size: Dp = 40.dp, iconSize: Dp = 20.dp,
    tint: Color = LocalLo.current.ink, bordered: Boolean = false, filled: Boolean = false, modifier: Modifier = Modifier,
) {
    val lo = LocalLo.current
    Box(
        modifier.size(size)
            .then(if (filled) Modifier.background(lo.signal, CircleShape) else Modifier)
            .then(if (bordered) Modifier.background(lo.surface2.copy(alpha = 0.85f), CircleShape) else Modifier)
            .pressable(CircleShape, onClick = onClick),
        Alignment.Center,
    ) { Ic(icon, iconSize, if (filled) Color.White else tint) }
}

@Composable
fun IconBtnV(icon: ImageVector, onClick: () -> Unit, size: Dp = 40.dp, iconSize: Dp = 24.dp, tint: Color = LocalLo.current.ink, modifier: Modifier = Modifier) {
    Box(modifier.size(size).pressable(CircleShape, onClick = onClick), Alignment.Center) { IcV(icon, iconSize, tint) }
}

/** Artwork: a hairline-edged rounded square with the placeholder grey behind it, like an Apple Music album cover. */
@Composable
fun Cover(url: String?, size: Dp, round: Boolean = false, modifier: Modifier = Modifier, radius: Dp = 10.dp) {
    val lo = LocalLo.current
    val shape = if (round) CircleShape else RoundedCornerShape(radius)
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.size(size).clip(shape).background(lo.surface2).border(0.5.dp, lo.line.copy(alpha = 0.8f), shape),
    )
}

/** Soft drop shadow under artwork, the way album pages float the cover. */
fun Modifier.coverShadow(radius: Dp, elevation: Dp = 18.dp): Modifier =
    shadow(elevation, RoundedCornerShape(radius), clip = false, ambientColor = Color.Black.copy(alpha = 0.5f), spotColor = Color.Black.copy(alpha = 0.5f))

/** Blurred artwork that fades into the page background; sits behind a detail header. */
@Composable
fun Ambient(url: String?, modifier: Modifier = Modifier, height: Dp = 380.dp, strength: Float? = null) {
    val lo = LocalLo.current
    if (url == null) return
    Box(modifier.fillMaxWidth().height(height)) {
        AsyncImage(
            model = url, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().blur(80.dp).alpha(strength ?: if (lo.dark) 0.42f else 0.30f),
        )
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, lo.bg))))
    }
}

/**
 * The vivid colour of an artwork (Palette), used to wash a detail page behind its cover as Apple Music does.
 * Null until the image has been read, or when it cannot be.
 */
@Composable
fun rememberTint(url: String?): Color? {
    val ctx = LocalContext.current
    val tint by produceState<Color?>(null, url) {
        value = null
        if (url == null) return@produceState
        value = withContext(Dispatchers.IO) {
            runCatching {
                val req = ImageRequest.Builder(ctx).data(url).size(96).allowHardware(false).build()
                val bmp = SingletonImageLoader.get(ctx).execute(req).image?.toBitmap() ?: return@runCatching null
                val p = Palette.from(bmp).maximumColorCount(16).generate()
                (p.vibrantSwatch ?: p.mutedSwatch ?: p.dominantSwatch)?.rgb?.let { Color(it) }
            }.getOrNull()
        }
    }
    return tint
}

/** 0.5dp separator, inset from the left so it starts under the text, as in Apple Music lists. */
@Composable
fun Hairline(inset: Dp = 0.dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(start = inset).height(0.5.dp).background(LocalLo.current.line))
}

// ---------- text blocks ----------

/** Shelf heading: bold title with a trailing chevron, or an accent action link. */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, action: String? = null, chevron: Boolean = true, onAction: (() -> Unit)? = null) {
    val lo = LocalLo.current
    Row(modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 26.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        val hasAction = action != null && onAction != null
        Text(text, style = LoType.section.copy(fontSize = 20.sp, lineHeight = 25.sp), color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = hasAction))
        if (action != null && onAction != null) {
            Text(action, style = LoType.body.copy(fontWeight = FontWeight.Normal), color = lo.signal, modifier = Modifier.pressable(CircleShape, onClick = onAction).padding(horizontal = 8.dp, vertical = 4.dp))
        } else if (chevron) {
            Icon(Icons.Rounded.ChevronRight, null, tint = lo.grey, modifier = Modifier.padding(start = 2.dp, top = 3.dp).size(22.dp))
        }
    }
}

/** Small grey kicker line above a title (a date, a section name). */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, accent: Boolean = false) =
    Text(text.uppercase(), style = LoType.eyebrow, color = if (accent) LocalLo.current.signal else LocalLo.current.grey, modifier = modifier)

@Composable
fun Loading() = Box(Modifier.fillMaxWidth().padding(48.dp), Alignment.Center) {
    CircularProgressIndicator(color = LocalLo.current.grey, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
}

// ---------- skeleton loading ----------

/** Pulsing placeholder block: the base of every skeleton. */
@Composable
fun SkeletonBox(modifier: Modifier, shape: Shape = RoundedCornerShape(6.dp)) {
    val lo = LocalLo.current
    val a by androidx.compose.animation.core.rememberInfiniteTransition(label = "sk").animateFloat(
        0.45f, 1f,
        androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(850, easing = androidx.compose.animation.core.FastOutSlowInEasing), androidx.compose.animation.core.RepeatMode.Reverse),
        label = "sk",
    )
    Box(modifier.graphicsLayer { alpha = a }.background(lo.surface2, shape))
}

/** Placeholder song rows (cover + two lines), matching TrackRow / ResultRow. */
@Composable
fun SkeletonRows(count: Int = 8, round: Boolean = false) {
    Column {
        repeat(count) { i ->
            Row(Modifier.padding(start = 20.dp, end = 16.dp, top = 7.dp, bottom = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                SkeletonBox(Modifier.size(52.dp), if (round) CircleShape else RoundedCornerShape(6.dp))
                Spacer(Modifier.width(14.dp))
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    SkeletonBox(Modifier.fillMaxWidth(if (i % 3 == 0) 0.55f else 0.7f).height(13.dp))
                    SkeletonBox(Modifier.fillMaxWidth(0.4f).height(11.dp))
                }
            }
        }
    }
}

/** Placeholder horizontal shelves of square cards, for Home / New. */
@Composable
fun SkeletonShelves(shelves: Int = 2) {
    Column {
        repeat(shelves) {
            SkeletonBox(Modifier.padding(start = 20.dp, top = 18.dp, bottom = 12.dp).width(150.dp).height(20.dp))
            Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                repeat(3) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        SkeletonBox(Modifier.fillMaxWidth().aspectRatio(1f), RoundedCornerShape(10.dp))
                        SkeletonBox(Modifier.fillMaxWidth(0.8f).height(12.dp))
                        SkeletonBox(Modifier.fillMaxWidth(0.5f).height(10.dp))
                    }
                }
            }
        }
    }
}

/** Placeholder album / playlist / artist page: centred cover, title, buttons, rows. */
@Composable
fun SkeletonDetail() {
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(top = 64.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        SkeletonBox(Modifier.size(230.dp), RoundedCornerShape(12.dp))
        Spacer(Modifier.height(18.dp))
        SkeletonBox(Modifier.width(200.dp).height(20.dp))
        Spacer(Modifier.height(8.dp))
        SkeletonBox(Modifier.width(120.dp).height(14.dp))
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SkeletonBox(Modifier.width(110.dp).height(44.dp), CircleShape)
            SkeletonBox(Modifier.width(110.dp).height(44.dp), CircleShape)
        }
        Spacer(Modifier.height(16.dp))
        SkeletonRows(5)
    }
}

@Composable
fun EmptyState(icon: Ph, title: String, hint: String? = null, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    Column(modifier.fillMaxWidth().padding(horizontal = 36.dp, vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Ic(icon, 44.dp, lo.grey.copy(alpha = 0.7f))
        Spacer(Modifier.height(6.dp))
        Text(title, style = LoType.body.copy(fontWeight = FontWeight.SemiBold, fontSize = 19.sp, lineHeight = 24.sp), color = lo.ink, textAlign = TextAlign.Center)
        if (hint != null) Text(hint, style = LoType.small.copy(fontSize = 15.sp, lineHeight = 20.sp), color = lo.grey, textAlign = TextAlign.Center)
    }
}

@Composable
fun ErrorBox(message: String) = EmptyState(Ph.Warn, "Something went wrong", message)

fun artistLine(s: SongItem) = s.artists.joinToString(", ") { it.name }

/** The line under a card: artists, year or author depending on the type. */
fun subtitle(item: YTItem): String = when (item) {
    is SongItem -> artistLine(item)
    is AlbumItem -> listOfNotNull(item.artists?.joinToString(", ") { it.name }, item.year?.toString()).joinToString(" · ")
    is PlaylistItem -> item.author?.name ?: item.songCountText.orEmpty()
    is ArtistItem -> "Artist"
}

// ---------- rows and cards ----------

/** Little animated-looking level bars shown on the song that is playing. */
@Composable
private fun NowPlayingBars(tint: Color, modifier: Modifier = Modifier) = Ic(Ph.Waveform, 16.dp, tint, modifier)

/**
 * One song line. Cover, two lines of text, a quiet trailing value and an inset hairline underneath.
 * [active] marks the song that is playing now.
 */
@Composable
fun MediaRow(
    title: String, line: String, thumb: String?, trailing: String? = null, index: Int? = null, active: Boolean = false,
    separator: Boolean = true, pad: Dp = 20.dp, menu: MenuTarget? = null, flat: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit,
) {
    val lo = LocalLo.current
    val openMenu = LocalTrackMenu.current
    val haptic = rememberHaptic()
    val inset = pad + if (index != null) 36.dp else 66.dp
    Column(modifier.fillMaxWidth().pressable(RoundedCornerShape(0.dp), onClick = onClick)) {
        Row(Modifier.fillMaxWidth().padding(start = pad, end = if (pad < 12.dp) 0.dp else 12.dp, top = 7.dp, bottom = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            if (index != null) {
                Box(Modifier.width(36.dp)) {
                    if (active) NowPlayingBars(lo.signal) else Text("${index + 1}", style = LoType.body, color = lo.grey)
                }
            } else {
                Box {
                    Cover(thumb, if (flat) 46.dp else 52.dp, radius = if (flat) 5.dp else 6.dp)
                    if (active) Box(Modifier.size(if (flat) 46.dp else 52.dp).background(Color(0x73000000), RoundedCornerShape(6.dp)), Alignment.Center) { NowPlayingBars(Color.White) }
                }
                Spacer(Modifier.width(14.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = LoType.body, color = if (active) lo.signal else lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (line.isNotBlank()) Text(line, style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (trailing != null && !flat) Text(trailing, style = LoType.small, color = lo.grey, modifier = Modifier.padding(start = 10.dp))
            if (menu != null) Box(Modifier.size(40.dp).pressable(CircleShape) { haptic(true); openMenu(menu) }, Alignment.Center) { Ic(Ph.More, 22.dp, lo.grey) }
            else Spacer(Modifier.width(6.dp))
        }
        if (separator && !flat) Hairline(inset)
    }
}

@Composable
fun playingId(): String? {
    val pc = LocalPlayer.current ?: return null
    val meta by pc.mediaMetadata.collectAsState()
    return meta?.id
}

@Composable
fun TrackRow(song: SongItem, index: Int? = null, flat: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    MediaRow(song.title, artistLine(song), song.thumbnail, song.duration?.let { formatTime(it * 1000L) }, index, playingId() == song.id, menu = MenuTarget(song.toMediaMetadata()), flat = flat, modifier = modifier, onClick = onClick)
}

/** Shelf card: square art with a soft edge, one line of title, one of grey detail. */
@Composable
fun ItemCard(item: YTItem, onClick: () -> Unit) {
    val lo = LocalLo.current
    val artist = item is ArtistItem
    Column(Modifier.width(156.dp).pressable(RoundedCornerShape(10.dp), onClick = onClick), horizontalAlignment = if (artist) Alignment.CenterHorizontally else Alignment.Start) {
        Cover(item.thumbnail, 156.dp, round = artist, radius = 10.dp)
        Spacer(Modifier.height(8.dp))
        Text(item.title, style = LoType.body.copy(fontSize = 15.sp), color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = if (artist) TextAlign.Center else TextAlign.Start)
        Text(subtitle(item), style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = if (artist) TextAlign.Center else TextAlign.Start)
    }
}

/** Square card used in shelves of plain tracks. */
@Composable
fun MediaCard(thumb: String?, title: String, line: String, active: Boolean = false, onClick: () -> Unit) {
    val lo = LocalLo.current
    Column(Modifier.width(156.dp).pressable(RoundedCornerShape(10.dp), onClick = onClick)) {
        Cover(thumb, 156.dp, radius = 10.dp)
        Spacer(Modifier.height(8.dp))
        Text(title, style = LoType.body.copy(fontSize = 15.sp), color = if (active) lo.signal else lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(line, style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Opens an item: songs play, everything else navigates. */
@Composable
fun rememberOpen(): (YTItem) -> Unit {
    val nav = LocalNav.current
    val player = LocalPlayer.current
    return { item ->
        when (item) {
            is SongItem -> player?.playRadio(item)
            is AlbumItem -> nav.push(Screen.Album(item.browseId))
            is ArtistItem -> nav.push(Screen.Artist(item.id))
            is PlaylistItem -> nav.push(Screen.Playlist(item.id))
        }
    }
}

@Composable
fun Shelf(title: String, items: List<YTItem>) {
    val open = rememberOpen()
    Column {
        SectionTitle(title)
        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(items) { ItemCard(it) { open(it) } }
        }
    }
}

// ---------- buttons, segmented control, bars ----------

/**
 * Apple Music capsule button. [filled] is the solid ink Play button (black on light, white on dark),
 * otherwise a quiet grey capsule with ink text; [accent] gives the solid blue call to action.
 */
@Composable
fun Pill(text: String, onClick: () -> Unit, filled: Boolean = true, icon: Ph? = null, modifier: Modifier = Modifier, iconV: ImageVector? = null, accent: Boolean = false) {
    val lo = LocalLo.current
    val bgc = if (accent) lo.signal else if (filled) lo.ink else lo.surface2
    val fg = if (accent) Color.White else if (filled) lo.bg else lo.ink
    Row(
        modifier.height(46.dp)
            .background(bgc, CircleShape)
            .pressable(CircleShape, onClick = onClick)
            .padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) { Ic(icon, 18.dp, fg); Spacer(Modifier.width(8.dp)) }
        if (iconV != null) { IcV(iconV, 22.dp, fg); Spacer(Modifier.width(6.dp)) }
        Text(text, style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = fg)
    }
}

/** Frosted round control (back, add, more) that floats over artwork. */
@Composable
fun GlassCircle(icon: ImageVector, onClick: () -> Unit, size: Dp = 42.dp, tint: Color = LocalLo.current.ink, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    Box(
        modifier.size(size).shadow(6.dp, CircleShape, clip = false, ambientColor = Color.Black.copy(alpha = 0.18f), spotColor = Color.Black.copy(alpha = 0.18f))
            .background(lo.card.copy(alpha = 0.92f), CircleShape).border(0.5.dp, lo.line.copy(alpha = 0.7f), CircleShape)
            .pressable(CircleShape, onClick = onClick),
        Alignment.Center,
    ) { IcV(icon, size * 0.5f, tint) }
}

/** Account avatar shown top-right on the main pages. */
@Composable
fun Avatar(initial: String, onClick: () -> Unit, size: Dp = 36.dp) {
    Box(
        Modifier.size(size).background(Brush.linearGradient(listOf(Color(0xFFC3B1F5), Color(0xFF6F7BD9))), CircleShape).pressable(CircleShape, onClick = onClick),
        Alignment.Center,
    ) { Text(initial.take(2).uppercase(), style = LoType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold), color = Color.White) }
}

/** Floating glass surface used by the mini player and the tab bar. */
fun Modifier.glass(shape: Shape, lo: Lo): Modifier =
    shadow(14.dp, shape, clip = false, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.25f))
        .background(lo.card, shape).border(0.5.dp, lo.line.copy(alpha = 0.8f), shape)

/** iOS segmented control: a grey track with a raised white (or lifted grey) thumb under the selection. */
@Composable
fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    val track = RoundedCornerShape(10.dp)
    Row(modifier.fillMaxWidth().padding(horizontal = 20.dp).height(36.dp).background(lo.surface2, track).padding(2.dp)) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            val thumb = RoundedCornerShape(8.dp)
            Box(
                Modifier.weight(1f).fillMaxHeight()
                    .then(if (on) Modifier.shadow(1.dp, thumb).background(if (lo.dark) Color(0xFF636366) else Color.White, thumb) else Modifier)
                    .pressable(thumb) { onSelect(i) },
                Alignment.Center,
            ) { Text(label, style = LoType.small.copy(fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium), color = lo.ink, maxLines = 1) }
        }
    }
}

/** Horizontally scrolling scope pills (search filters). */
@Composable
fun Chips(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier, center: Boolean = false) {
    val lo = LocalLo.current
    LazyRow(
        modifier.padding(horizontal = if (center) 0.dp else 0.dp),
        contentPadding = PaddingValues(horizontal = if (center) 0.dp else 20.dp),
        horizontalArrangement = if (center) Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally) else Arrangement.spacedBy(8.dp),
    ) {
        items(options.size) { i ->
            val on = i == selected
            Text(
                options[i], style = LoType.small.copy(fontWeight = FontWeight.SemiBold),
                color = if (on) Color.White else lo.ink,
                modifier = Modifier
                    .background(if (on) lo.signal else lo.surface2, CircleShape)
                    .pressable(CircleShape) { onSelect(i) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
    }
}

/** Floating glass back control over detail art. */
@Composable
fun TopBar(title: String, onBack: (() -> Unit)?, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    Row(modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) GlassCircle(androidx.compose.material.icons.Icons.Rounded.ChevronLeft, onBack)
        if (title.isNotBlank()) Text(title, style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = lo.ink, modifier = Modifier.padding(start = 12.dp))
    }
}

/** iOS large title with an optional grey kicker above and a subtitle below. */
@Composable
fun PageTitle(eyebrow: String, title: String, sub: String? = null) {
    val lo = LocalLo.current
    Column(Modifier.statusBarsPadding().padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 6.dp)) {
        if (eyebrow.isNotBlank()) Eyebrow(eyebrow)
        Text(title, style = LoType.hero, color = lo.ink, modifier = Modifier.padding(top = 2.dp))
        if (sub != null) Text(sub, style = LoType.body, color = lo.grey, modifier = Modifier.padding(top = 2.dp))
    }
}

@Composable
fun SearchField(value: String, onChange: (String) -> Unit, hint: String, onSearch: () -> Unit, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    val shape = CircleShape
    Row(
        modifier.fillMaxWidth().height(46.dp).background(lo.surface2, shape).padding(start = 14.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Ic(Ph.Search, 19.dp, lo.grey)
        Spacer(Modifier.width(8.dp))
        androidx.compose.foundation.text.BasicTextField(
            value = value, onValueChange = onChange, singleLine = true,
            textStyle = LoType.body.copy(color = lo.ink, fontSize = 17.sp), cursorBrush = SolidColor(lo.signal),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
            keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                if (value.isEmpty()) Text(hint, style = LoType.body.copy(fontSize = 17.sp), color = lo.grey)
                inner()
            },
        )
        if (value.isNotEmpty()) IconBtn(Ph.Close, { onChange("") }, size = 32.dp, iconSize = 14.dp, tint = lo.grey)
        else IcV(Icons.Rounded.Mic, 20.dp, lo.grey, Modifier.padding(end = 6.dp))
    }
}

/** Space the floating mini player and tab bar take at the bottom, so lists can scroll clear of them. */
val LocalBottomInset = compositionLocalOf { 0.dp }

@Composable
fun bottomPad(): Dp = LocalBottomInset.current + 24.dp

/** Small UI switches kept in SharedPreferences, readable from composables. */
object UiPrefs {
    private var newTab by androidx.compose.runtime.mutableStateOf<Boolean?>(null)

    /** The New tab is hidden by default; Settings → Tabs turns it on. */
    @Composable
    fun showNew(ctx: android.content.Context): Boolean =
        newTab ?: ctx.getSharedPreferences("lomu", android.content.Context.MODE_PRIVATE).getBoolean("showNewTab", false)

    fun setShowNew(ctx: android.content.Context, on: Boolean) {
        newTab = on
        ctx.getSharedPreferences("lomu", android.content.Context.MODE_PRIVATE).edit().putBoolean("showNewTab", on).apply()
    }
}

/**
 * Soft drifting pools of colour for a page background (Home). Colours come from the artwork on the page, cross-fade when they
 * change, and drift very slowly. Only the draw phase is invalidated by the drift, and it stops when the page leaves composition.
 */
@Composable
fun ColorPools(colors: List<Color?>, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    val fallback = listOf(lo.signal, Color(0xFFAF52DE), Color(0xFFFF2D55))
    val anim = List(3) { i ->
        androidx.compose.animation.animateColorAsState(colors.getOrNull(i) ?: fallback[i], androidx.compose.animation.core.tween(1400), label = "pool$i").value
    }
    val t by androidx.compose.animation.core.rememberInfiniteTransition(label = "pools").animateFloat(
        0f, 1f,
        androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(45000, easing = androidx.compose.animation.core.LinearEasing), androidx.compose.animation.core.RepeatMode.Reverse),
        label = "poolsT",
    )
    val a = if (lo.dark) 0.62f else 0.42f
    Box(
        modifier.fillMaxWidth().height(560.dp).drawBehind {
            val spots = listOf(0.15f to 0.05f, 0.9f to 0.22f, 0.4f to 0.5f)
            anim.forEachIndexed { i, c ->
                val (bx, by) = spots[i]
                val ph = (t + i * 0.33f) * 6.2832f
                val center = androidx.compose.ui.geometry.Offset(size.width * (bx + 0.10f * kotlin.math.sin(ph)), size.height * (by + 0.07f * kotlin.math.cos(ph)))
                val r = size.width * 0.95f
                drawCircle(Brush.radialGradient(listOf(c.copy(alpha = a), Color.Transparent), center, r), r, center)
            }
        },
    ) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.55f to Color.Transparent, 1f to lo.bg)))
    }
}
