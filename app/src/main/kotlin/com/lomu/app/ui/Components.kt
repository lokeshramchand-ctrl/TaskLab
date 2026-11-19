package com.lomu.app.ui

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
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
import coil3.compose.AsyncImage
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
fun Cover(url: String?, size: Dp, round: Boolean = false, modifier: Modifier = Modifier, radius: Dp = 8.dp) {
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
fun Ambient(url: String?, modifier: Modifier = Modifier, height: Dp = 380.dp) {
    val lo = LocalLo.current
    if (url == null) return
    Box(modifier.fillMaxWidth().height(height)) {
        AsyncImage(
            model = url, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().blur(80.dp).alpha(if (lo.dark) 0.42f else 0.30f),
        )
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, lo.bg))))
    }
}

/** 0.5dp separator, inset from the left so it starts under the text, as in Apple Music lists. */
@Composable
fun Hairline(inset: Dp = 0.dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(start = inset).height(0.5.dp).background(LocalLo.current.line))
}

// ---------- text blocks ----------

/** Shelf heading: bold title with a trailing chevron, or an accent action link. */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, action: String? = null, onAction: (() -> Unit)? = null) {
    val lo = LocalLo.current
    Row(modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 26.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = LoType.section, color = lo.ink, modifier = Modifier.weight(1f, fill = false))
        if (action != null && onAction != null) {
            Spacer(Modifier.weight(1f))
            Text(action, style = LoType.body.copy(fontWeight = FontWeight.Normal), color = lo.signal, modifier = Modifier.pressable(CircleShape, onClick = onAction).padding(horizontal = 8.dp, vertical = 4.dp))
        } else {
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
    separator: Boolean = true, onClick: () -> Unit,
) {
    val lo = LocalLo.current
    val inset = if (index != null) 56.dp else 80.dp
    Column(Modifier.fillMaxWidth().pressable(RoundedCornerShape(0.dp), onClick = onClick)) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 7.dp, bottom = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            if (index != null) {
                Box(Modifier.width(36.dp)) {
                    if (active) NowPlayingBars(lo.signal) else Text("${index + 1}", style = LoType.body, color = lo.grey)
                }
            } else {
                Box {
                    Cover(thumb, 52.dp, radius = 6.dp)
                    if (active) Box(Modifier.size(52.dp).background(Color(0x73000000), RoundedCornerShape(6.dp)), Alignment.Center) { NowPlayingBars(Color.White) }
                }
                Spacer(Modifier.width(14.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = LoType.body, color = if (active) lo.signal else lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (line.isNotBlank()) Text(line, style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (trailing != null) Text(trailing, style = LoType.small, color = lo.grey, modifier = Modifier.padding(start = 10.dp))
            Icon(Icons.Rounded.MoreHoriz, null, tint = lo.grey, modifier = Modifier.padding(start = 6.dp).size(22.dp))
        }
        if (separator) Hairline(inset)
    }
}

@Composable
fun playingId(): String? {
    val pc = LocalPlayer.current ?: return null
    val meta by pc.mediaMetadata.collectAsState()
    return meta?.id
}

@Composable
fun TrackRow(song: SongItem, index: Int? = null, onClick: () -> Unit) {
    MediaRow(song.title, artistLine(song), song.thumbnail, song.duration?.let { formatTime(it * 1000L) }, index, playingId() == song.id, onClick = onClick)
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
 * Apple Music button: [filled] is the solid red call to action, otherwise the quiet grey capsule with red text
 * used for Play and Shuffle on album pages.
 */
@Composable
fun Pill(text: String, onClick: () -> Unit, filled: Boolean = true, icon: Ph? = null, modifier: Modifier = Modifier, iconV: ImageVector? = null) {
    val lo = LocalLo.current
    val shape = RoundedCornerShape(12.dp)
    val fg = if (filled) Color.White else lo.signal
    Row(
        modifier.height(48.dp)
            .background(if (filled) lo.signal else lo.surface2, shape)
            .pressable(shape, onClick = onClick)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) { Ic(icon, 18.dp, fg); Spacer(Modifier.width(8.dp)) }
        if (iconV != null) { IcV(iconV, 22.dp, fg); Spacer(Modifier.width(6.dp)) }
        Text(text, style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = fg)
    }
}

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
                color = if (on) lo.bg else lo.ink,
                modifier = Modifier
                    .background(if (on) lo.ink else lo.surface2, CircleShape)
                    .pressable(CircleShape) { onSelect(i) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
    }
}

/** Floating back control over detail art: a red chevron in a frosted circle. */
@Composable
fun TopBar(title: String, onBack: (() -> Unit)?, modifier: Modifier = Modifier) {
    val lo = LocalLo.current
    Row(modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) {
            Box(Modifier.size(38.dp).background(lo.card.copy(alpha = 0.88f), CircleShape).pressable(CircleShape, onClick = onBack), Alignment.Center) {
                Ic(Ph.Left, 18.dp, lo.signal)
            }
        } else Spacer(Modifier.width(8.dp))
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
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier.fillMaxWidth().height(44.dp).background(lo.surface2, shape).padding(start = 12.dp, end = 6.dp),
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
    }
}
