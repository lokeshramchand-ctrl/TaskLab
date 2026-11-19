package com.lomu.app.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.lomu.app.constants.PlaylistSortType
import com.lomu.app.constants.SongSortType
import com.lomu.app.db.entities.Song
import com.lomu.app.extensions.toMediaItem
import com.lomu.app.playback.queues.YouTubeQueue
import com.music.innertube.YouTube
import com.music.innertube.models.ArtistItem
import com.music.innertube.models.SongItem
import com.music.innertube.models.WatchEndpoint
import com.music.innertube.models.YTItem
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

@Composable
private fun likedSongs(): List<Song> {
    val player = LocalPlayer.current
    val flow = remember(player) { player?.database?.likedSongs(SongSortType.CREATE_DATE, true) ?: flowOf(emptyList()) }
    val songs by flow.collectAsState(emptyList())
    return songs
}

/** Section heading with a grey caption under it, as on "Top Picks / More from ...". */
@Composable
private fun CaptionedTitle(title: String, caption: String?, action: String? = null, onAction: (() -> Unit)? = null) {
    val lo = LocalLo.current
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 22.dp, bottom = 10.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            Text(title, style = LoType.section, color = lo.ink)
            if (caption != null) Text(caption, style = LoType.small, color = lo.grey)
        }
        if (action != null && onAction != null) {
            Text(action, style = LoType.sub, color = lo.signal, modifier = Modifier.pressable(CircleShape, onClick = onAction).padding(horizontal = 8.dp, vertical = 4.dp))
        }
    }
}

/** Large portrait card: full art with a tinted caption plate at the foot (Listen Now "Top Picks"). */
@Composable
private fun FeatureCard(thumb: String?, title: String, line: String, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Box(Modifier.width(290.dp).height(340.dp).pressable(shape, onClick = onClick).background(LocalLo.current.surface2, shape)) {
        AsyncImage(model = thumb, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC000000))))
                .padding(start = 14.dp, end = 14.dp, top = 40.dp, bottom = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, style = LoType.sub.copy(fontWeight = FontWeight.SemiBold), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(line, style = LoType.small, color = Color(0xCCFFFFFF), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ======================================================================================= Home

@Composable
fun HomeScreen() {
    val state by load("home") { YouTube.home() }
    val player = LocalPlayer.current
    val nav = LocalNav.current
    val lo = LocalLo.current
    val liked = likedSongs()
    val recent = liked.take(12)
    val now = playingId()
    val sync = LocalSync.current
    val fallback = remember { kotlinx.coroutines.flow.MutableStateFlow(com.lomu.app.sync.SyncState()) }
    val syncState by (sync?.state ?: fallback).collectAsState()
    val recs by produceState<List<com.lomu.app.sync.SyncClient.RecShelf>>(emptyList(), syncState.user, syncState.status.startsWith("Up to date")) {
        value = runCatching { sync?.recs() }.getOrNull().orEmpty()
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Row(Modifier.statusBarsPadding().padding(start = 20.dp, end = 16.dp, top = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Listen Now", style = LoType.hero, color = lo.ink, modifier = Modifier.weight(1f))
                Box(Modifier.size(34.dp).pressable(CircleShape) { nav.tab(Screen.Settings) }, Alignment.Center) {
                    Icon(Icons.Outlined.AccountCircle, null, tint = lo.signal, modifier = Modifier.size(32.dp))
                }
            }
            Box(Modifier.padding(start = 20.dp, top = 8.dp).fillMaxWidth().height(0.5.dp).background(lo.line))
        }
        val top = recs.firstOrNull()
        if (top != null) item {
            Column {
                CaptionedTitle("Top Picks", "Made for ${syncState.user ?: "you"}")
                LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(top.tracks.take(10)) { m ->
                        FeatureCard(m.thumbnailUrl, m.title, m.artists.joinToString { it.name }) {
                            player?.playQueue(YouTubeQueue(WatchEndpoint(videoId = m.id), m))
                        }
                    }
                }
            }
        }
        if (recent.isNotEmpty()) item {
            Column {
                CaptionedTitle("Recently Liked", null, "See All") { nav.push(Screen.Liked) }
                LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    itemsIndexed(recent) { i, s ->
                        MediaCard(s.song.thumbnailUrl, s.song.title, s.artists.joinToString { it.name }, now == s.song.id) {
                            player?.playMediaItems("Liked", recent.map { it.toMediaItem() }, i)
                        }
                    }
                }
            }
        }
        items(recs.drop(1)) { shelf ->
            Column {
                SectionTitle(shelf.title)
                LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(shelf.tracks) { m ->
                        MediaCard(m.thumbnailUrl, m.title, m.artists.joinToString { it.name }, now == m.id) {
                            player?.playQueue(YouTubeQueue(WatchEndpoint(videoId = m.id), m))
                        }
                    }
                }
            }
        }
        when (val st = state) {
            is Load.Loading -> item { Loading() }
            is Load.Err -> item { ErrorBox(st.message) }
            is Load.Ok -> items(st.value.sections) { Shelf(it.title, it.items) }
        }
    }
}

// ===================================================================================== Search

private val TRY_SEARCHES = listOf("Top hits India", "Lo-fi beats", "Workout", "Arijit Singh", "Anirudh", "Chill vibes", "Punjabi", "90s Bollywood")
private val TILE_COLORS = listOf(
    Color(0xFFFF2D55) to Color(0xFFFF6B81), Color(0xFF5856D6) to Color(0xFF8E8CF0), Color(0xFFFF9500) to Color(0xFFFFB84D),
    Color(0xFF34C759) to Color(0xFF7BE095), Color(0xFF007AFF) to Color(0xFF5AA9FF), Color(0xFFAF52DE) to Color(0xFFCB84EE),
    Color(0xFFFF3B30) to Color(0xFFFF7A70), Color(0xFF30B0C7) to Color(0xFF6FD0E0),
)

@Composable
fun SearchScreen() {
    val lo = LocalLo.current
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("lomu", Context.MODE_PRIVATE) }
    var recent by remember { mutableStateOf(prefs.getString("recent", "").orEmpty().split('\u0001').filter { it.isNotBlank() }) }
    var text by remember { mutableStateOf("") }
    var submitted by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(0) }
    var suggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    fun submit(q: String) {
        val v = q.trim()
        if (v.isBlank()) return
        text = v; submitted = v; filter = 0; suggestions = emptyList()
        recent = (listOf(v) + recent.filter { !it.equals(v, true) }).take(8)
        prefs.edit().putString("recent", recent.joinToString("\u0001")).apply()
    }
    LaunchedEffect(text) {
        if (text.isBlank()) { suggestions = emptyList(); return@LaunchedEffect }
        delay(250)
        if (text != submitted) suggestions = YouTube.searchSuggestions(text).getOrNull()?.queries.orEmpty().take(6)
    }
    val result by load(submitted) {
        if (submitted.isBlank()) Result.success(null) else YouTube.searchSummary(submitted).map { it }
    }
    val open = rememberOpen()
    Column(Modifier.fillMaxSize()) {
        PageTitle("", "Search")
        SearchField(text, { text = it; if (it.isBlank()) submitted = "" }, "Artists, Songs, Lyrics and More", { submit(text) }, Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        val summaries = when (val r0 = result) { is Load.Ok -> r0.value?.summaries.orEmpty(); else -> emptyList() }
        if (submitted.isNotBlank() && suggestions.isEmpty() && summaries.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Chips(listOf("All") + summaries.map { it.title }, filter, { filter = it })
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
            if (suggestions.isNotEmpty()) {
                items(suggestions) { q ->
                    Column(Modifier.fillMaxWidth().pressable(RoundedCornerShape(0.dp)) { submit(q) }) {
                        Row(Modifier.padding(horizontal = 20.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                            Ic(Ph.Search, 18.dp, lo.grey)
                            Spacer(Modifier.width(14.dp))
                            Text(q, style = LoType.body, color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Hairline(52.dp)
                    }
                }
            } else if (submitted.isBlank()) {
                item {
                    Column {
                        if (recent.isNotEmpty()) {
                            SectionTitle("Recent Searches", action = "Clear") {
                                recent = emptyList(); prefs.edit().remove("recent").apply()
                            }
                            recent.forEach { r ->
                                Column(Modifier.fillMaxWidth().pressable(RoundedCornerShape(0.dp)) { submit(r) }) {
                                    Row(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Ic(Ph.History, 18.dp, lo.grey)
                                        Spacer(Modifier.width(14.dp))
                                        Text(r, style = LoType.body, color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                    Hairline(52.dp)
                                }
                            }
                        }
                        SectionTitle("Browse Categories")
                        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            TRY_SEARCHES.withIndex().chunked(2).forEach { pair ->
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    pair.forEach { (i, label) -> CategoryTile(label, TILE_COLORS[i % TILE_COLORS.size], Modifier.weight(1f)) { submit(label) } }
                                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            } else when (val r = result) {
                is Load.Loading -> item { Loading() }
                is Load.Err -> item { ErrorBox(r.message) }
                is Load.Ok -> {
                    val sums = r.value?.summaries.orEmpty()
                    if (sums.isEmpty()) item { EmptyState(Ph.Search, "No Results for “$submitted”", "Check the spelling or try a new search.") }
                    val shown = if (filter == 0) sums.map { it to 5 } else listOfNotNull(sums.getOrNull(filter - 1)?.let { it to 50 })
                    shown.forEach { (sum, limit) ->
                        item { SectionTitle(sum.title, action = if (filter == 0 && sum.items.size > limit) "See All" else null) { filter = sums.indexOf(sum) + 1 } }
                        items(sum.items.take(limit)) { it ->
                            if (it is SongItem) TrackRow(it) { open(it) } else ResultRow(it) { open(it) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryTile(label: String, colors: Pair<Color, Color>, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier.height(96.dp).background(Brush.linearGradient(listOf(colors.first, colors.second)), shape).pressable(shape, onClick = onClick).padding(12.dp),
    ) {
        Text(label, style = LoType.body.copy(fontWeight = FontWeight.Bold), color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun ResultRow(item: YTItem, onClick: () -> Unit) {
    val lo = LocalLo.current
    Column(Modifier.fillMaxWidth().pressable(RoundedCornerShape(0.dp), onClick = onClick)) {
        Row(Modifier.padding(start = 20.dp, end = 16.dp, top = 7.dp, bottom = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Cover(item.thumbnail, 52.dp, round = item is ArtistItem, radius = 6.dp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(item.title, style = LoType.body, color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(subtitle(item), style = LoType.small, color = lo.grey, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.Rounded.ChevronRight, null, tint = lo.grey.copy(alpha = 0.7f), modifier = Modifier.size(20.dp))
        }
        Hairline(86.dp)
    }
}

// ==================================================================================== Library

@Composable
private fun playlistsState(): List<com.lomu.app.db.entities.Playlist> {
    val player = LocalPlayer.current
    val plFlow = remember(player) { player?.database?.playlists(PlaylistSortType.CREATE_DATE, true) ?: flowOf(emptyList()) }
    val playlists by plFlow.collectAsState(emptyList())
    return playlists
}

@Composable
private fun LibraryRow(icon: Ph, label: String, onClick: () -> Unit) {
    val lo = LocalLo.current
    Column(Modifier.fillMaxWidth().pressable(RoundedCornerShape(0.dp), onClick = onClick)) {
        Row(Modifier.padding(start = 20.dp, end = 16.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Ic(icon, 24.dp, lo.signal, Modifier.width(32.dp))
            Spacer(Modifier.width(10.dp))
            Text(label, style = LoType.body.copy(fontSize = 20.sp, lineHeight = 25.sp), color = lo.ink, modifier = Modifier.weight(1f))
            Icon(Icons.Rounded.ChevronRight, null, tint = lo.grey.copy(alpha = 0.7f), modifier = Modifier.size(22.dp))
        }
        Hairline(62.dp)
    }
}

@Composable
fun LibraryScreen() {
    val lo = LocalLo.current
    val nav = LocalNav.current
    val songs = likedSongs()
    val playlists = playlistsState()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Column(Modifier.statusBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 8.dp), horizontalArrangement = Arrangement.End) {
                    Text("Import", style = LoType.body, color = lo.signal, modifier = Modifier.pressable(CircleShape) { nav.push(Screen.Import) }.padding(horizontal = 8.dp, vertical = 6.dp))
                }
                Text("Library", style = LoType.hero, color = lo.ink, modifier = Modifier.padding(start = 20.dp, bottom = 10.dp))
            }
            Hairline(20.dp)
            LibraryRow(Ph.Playlist, "Playlists") { nav.push(Screen.Playlists) }
            LibraryRow(Ph.Heart, "Liked Songs") { nav.push(Screen.Liked) }
        }
        item { Text("Recently Added", style = LoType.section, color = lo.ink, modifier = Modifier.padding(start = 20.dp, top = 22.dp, bottom = 12.dp)) }
        if (playlists.isEmpty() && songs.isEmpty()) item {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                EmptyState(Ph.Library, "Your library is empty", "Like songs from the player, or bring your library over from YouTube Music.")
                Pill("Import from YouTube Music", { nav.push(Screen.Import) }, icon = Ph.Download)
            }
        }
        item {
            val tiles = playlists.map { Triple(it.playlist.name, "${it.songCount} songs", it.playlist.thumbnailUrl ?: it.thumbnails.firstOrNull()) to Screen.LocalPlaylist(it.playlist.id) }
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                tiles.take(8).chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        pair.forEach { (t, dest) ->
                            Column(Modifier.weight(1f).pressable(RoundedCornerShape(8.dp)) { nav.push(dest) }) {
                                BoxWithConstraints { Cover(t.third, maxWidth, radius = 8.dp) }
                                Text(t.first, style = LoType.sub, color = lo.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                                Text(t.second, style = LoType.small, color = lo.grey, maxLines = 1)
                            }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/** "‹ Library" accent back link above a large title, for pushed list pages. */
@Composable
private fun BackTitle(back: String, title: String, onBack: () -> Unit) {
    val lo = LocalLo.current
    Column(Modifier.statusBarsPadding()) {
        Row(Modifier.padding(start = 8.dp, top = 6.dp).pressable(CircleShape, onClick = onBack).padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Ic(Ph.Left, 18.dp, lo.signal)
            Spacer(Modifier.width(4.dp))
            Text(back, style = LoType.body, color = lo.signal)
        }
        Text(title, style = LoType.hero, color = lo.ink, modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 8.dp))
    }
}

@Composable
fun LikedScreen() {
    val nav = LocalNav.current
    val player = LocalPlayer.current
    val songs = likedSongs()
    val now = playingId()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { BackTitle("Library", "Liked Songs", nav::pop) }
        if (songs.isNotEmpty()) item {
            Row(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Pill("Play", { player?.playMediaItems("Liked", songs.map { it.toMediaItem() }) }, filled = false, iconV = Icons.Rounded.PlayArrow, modifier = Modifier.weight(1f))
                Pill("Shuffle", { player?.playMediaItems("Liked", songs.shuffled().map { it.toMediaItem() }) }, filled = false, iconV = Icons.Rounded.Shuffle, modifier = Modifier.weight(1f))
            }
        }
        if (songs.isEmpty()) item { EmptyState(Ph.Heart, "No Liked Songs", "Tap the heart in the player to add songs here.") }
        itemsIndexed(songs) { i, s ->
            MediaRow(s.song.title, s.artists.joinToString { it.name }, s.song.thumbnailUrl, active = now == s.song.id) {
                player?.playMediaItems("Liked", songs.map { it.toMediaItem() }, i)
            }
        }
    }
}

@Composable
fun PlaylistsScreen() {
    val nav = LocalNav.current
    val playlists = playlistsState()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { BackTitle("Library", "Playlists", nav::pop) }
        if (playlists.isEmpty()) item { EmptyState(Ph.Playlist, "No Playlists", "Playlists you import or create show up here.") }
        items(playlists) { p ->
            MediaRow(p.playlist.name, "${p.songCount} songs", p.playlist.thumbnailUrl ?: p.thumbnails.firstOrNull()) { nav.push(Screen.LocalPlaylist(p.playlist.id)) }
        }
    }
}

// ================================================================================ Detail pages

/**
 * Album / playlist page: centred art, headline, red artist line, caption and two grey Play / Shuffle buttons.
 * With [hero] (artists) the art runs edge to edge with the name over it and a red play button.
 */
@Composable
private fun Detail(
    cover: String?, title: String, accent: String?, caption: String,
    hero: Boolean = false, onPlay: (() -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    body: LazyListScope.() -> Unit,
) {
    val lo = LocalLo.current
    val nav = LocalNav.current
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                if (hero) {
                    Box(Modifier.fillMaxWidth().height(380.dp).background(lo.surface2)) {
                        AsyncImage(model = cover, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x99000000)), startY = 400f)))
                        Row(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 18.dp), verticalAlignment = Alignment.Bottom) {
                            Text(title, style = LoType.hero, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            if (onPlay != null) Box(Modifier.size(44.dp).background(lo.signal, CircleShape).pressable(CircleShape, onClick = onPlay), Alignment.Center) {
                                IcV(Icons.Rounded.PlayArrow, 28.dp, Color.White)
                            }
                        }
                    }
                    if (caption.isNotBlank()) Text(caption, style = LoType.small, color = lo.grey, modifier = Modifier.padding(start = 20.dp, top = 10.dp))
                } else {
                    Column(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 56.dp, start = 40.dp, end = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        BoxWithConstraints(Modifier.fillMaxWidth(), Alignment.Center) {
                            val side = minOf(maxWidth, 260.dp)
                            Cover(cover, side, radius = 8.dp, modifier = Modifier.coverShadow(8.dp, 14.dp))
                        }
                        Spacer(Modifier.height(18.dp))
                        Text(title, style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = lo.ink, textAlign = TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        if (!accent.isNullOrBlank()) Text(accent, style = LoType.body, color = lo.signal, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (caption.isNotBlank()) Text(caption.uppercase(), style = LoType.caption.copy(fontSize = 11.sp), color = lo.grey, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 2.dp))
                    }
                }
                if (actions != null) Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), content = actions)
                else Spacer(Modifier.height(8.dp))
            }
            body()
        }
        TopBar("", nav::pop)
    }
}

@Composable
private fun RowScope.PlayShuffle(play: () -> Unit, shuffle: () -> Unit) {
    Pill("Play", play, filled = false, iconV = Icons.Rounded.PlayArrow, modifier = Modifier.weight(1f))
    Pill("Shuffle", shuffle, filled = false, iconV = Icons.Rounded.Shuffle, modifier = Modifier.weight(1f))
}

@Composable
fun AlbumScreen(id: String) {
    val player = LocalPlayer.current
    val state by load(id) { YouTube.album(id) }
    when (val st = state) {
        is Load.Loading -> Box(Modifier.fillMaxSize()) { Loading(); TopBar("", LocalNav.current::pop) }
        is Load.Err -> Box(Modifier.fillMaxSize()) { ErrorBox(st.message); TopBar("", LocalNav.current::pop) }
        is Load.Ok -> {
            val page = st.value
            Detail(
                page.album.thumbnail, page.album.title, page.album.artists?.joinToString(", ") { it.name },
                listOfNotNull(page.album.year?.toString(), "${page.songs.size} songs").joinToString(" · "),
                actions = { PlayShuffle({ player?.playList(page.album.title, page.songs) }, { player?.playList(page.album.title, page.songs.shuffled()) }) },
            ) {
                itemsIndexed(page.songs) { i, s -> TrackRow(s, index = i) { player?.playList(page.album.title, page.songs, i) } }
            }
        }
    }
}

@Composable
fun PlaylistScreen(id: String) {
    val player = LocalPlayer.current
    val state by load(id) { YouTube.playlist(id) }
    when (val st = state) {
        is Load.Loading -> Box(Modifier.fillMaxSize()) { Loading(); TopBar("", LocalNav.current::pop) }
        is Load.Err -> Box(Modifier.fillMaxSize()) { ErrorBox(st.message); TopBar("", LocalNav.current::pop) }
        is Load.Ok -> {
            val page = st.value
            Detail(
                page.playlist.thumbnail, page.playlist.title, page.playlist.author?.name, page.playlist.songCountText.orEmpty(),
                actions = { PlayShuffle({ player?.playPlaylist(id, page.playlist.title, page.songs, page.songsContinuation) }, { player?.playList(page.playlist.title, page.songs.shuffled()) }) },
            ) {
                itemsIndexed(page.songs) { i, s -> TrackRow(s) { player?.playPlaylist(id, page.playlist.title, page.songs, page.songsContinuation, i) } }
            }
        }
    }
}

@Composable
fun ArtistScreen(id: String) {
    val player = LocalPlayer.current
    val lo = LocalLo.current
    val state by load(id) { YouTube.artist(id) }
    var bioOpen by remember { mutableStateOf(false) }
    when (val st = state) {
        is Load.Loading -> Box(Modifier.fillMaxSize()) { Loading(); TopBar("", LocalNav.current::pop) }
        is Load.Err -> Box(Modifier.fillMaxSize()) { ErrorBox(st.message); TopBar("", LocalNav.current::pop) }
        is Load.Ok -> {
            val page = st.value
            val firstSongs = page.sections.map { it.items.filterIsInstance<SongItem>() }.firstOrNull { it.isNotEmpty() }.orEmpty()
            Detail(
                page.artist.thumbnail, page.artist.title, null, page.subscriberCountText.orEmpty(), hero = true,
                onPlay = if (firstSongs.isNotEmpty()) ({ player?.playList(page.artist.title, firstSongs) }) else null,
            ) {
                items(page.sections) { sec ->
                    val songs = sec.items.filterIsInstance<SongItem>()
                    if (songs.isNotEmpty() && songs.size == sec.items.size) {
                        Column {
                            CaptionedTitle(sec.title, null, "See All") { player?.playList(sec.title, songs) }
                            songs.take(5).forEachIndexed { i, s -> TrackRow(s) { player?.playList(sec.title, songs, i) } }
                        }
                    } else Shelf(sec.title, sec.items)
                }
                page.description?.takeIf { it.isNotBlank() }?.let { d ->
                    item {
                        Column {
                            SectionTitle("About")
                            Column(Modifier.padding(horizontal = 20.dp).fillMaxWidth()) {
                                Text(d, style = LoType.sub, color = lo.ink, maxLines = if (bioOpen) Int.MAX_VALUE else 4, overflow = TextOverflow.Ellipsis)
                                Text(if (bioOpen) "less" else "more", style = LoType.sub, color = lo.signal, modifier = Modifier.padding(top = 6.dp).pressable { bioOpen = !bioOpen })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LocalPlaylistScreen(id: String) {
    val player = LocalPlayer.current
    val playlists = playlistsState()
    val meta = playlists.firstOrNull { it.playlist.id == id }
    val flow = remember(player, id) { player?.database?.playlistSongs(id) ?: flowOf(emptyList()) }
    val rows by flow.collectAsState(emptyList())
    val songs = rows.sortedBy { it.map.position }
    val items = songs.map { it.song.toMediaItem() }
    val now = playingId()
    Detail(
        meta?.playlist?.thumbnailUrl ?: songs.firstOrNull()?.song?.song?.thumbnailUrl, meta?.playlist?.name ?: "Playlist", null, "${songs.size} songs",
        actions = { PlayShuffle({ player?.playMediaItems("Playlist", items) }, { player?.playMediaItems("Playlist", items.shuffled()) }) },
    ) {
        if (songs.isEmpty()) item { EmptyState(Ph.Playlist, "This playlist is empty") }
        itemsIndexed(songs) { i, s ->
            MediaRow(s.song.song.title, s.song.artists.joinToString { it.name }, s.song.song.thumbnailUrl, active = now == s.song.song.id) {
                player?.playMediaItems("Playlist", items, i)
            }
        }
    }
}

// =================================================================================== Settings

/** iOS grouped section: small grey header, white rounded cells separated by inset hairlines, grey footer. */
@Composable
private fun Group(header: String?, footer: String? = null, content: @Composable ColumnScope.() -> Unit) {
    val lo = LocalLo.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        if (header != null) Text(header.uppercase(), style = LoType.small, color = lo.grey, modifier = Modifier.padding(start = 16.dp, top = 24.dp, bottom = 7.dp))
        else Spacer(Modifier.height(24.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(lo.cell), content = content)
        if (footer != null) Text(footer, style = LoType.small, color = lo.grey, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 7.dp))
    }
}

@Composable
private fun Cell(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) =
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).heightIn(min = 22.dp), verticalAlignment = Alignment.CenterVertically, content = content)

@Composable
private fun CellField(value: String, onChange: (String) -> Unit, hint: String, password: Boolean = false) {
    val lo = LocalLo.current
    Cell {
        BasicTextField(
            value = value, onValueChange = onChange, singleLine = true,
            textStyle = LoType.body.copy(color = lo.ink), cursorBrush = SolidColor(lo.signal),
            visualTransformation = if (password) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                if (value.isEmpty()) Text(hint, style = LoType.body, color = lo.grey)
                inner()
            },
        )
    }
}

@Composable
private fun IconTile(icon: Ph, color: Color, size: Dp = 30.dp) {
    Box(Modifier.size(size).background(color, RoundedCornerShape(7.dp)), Alignment.Center) { Ic(icon, size * 0.62f, Color.White) }
}

@Composable
private fun ActionCell(label: String, color: Color, enabled: Boolean = true, onClick: () -> Unit) {
    Cell(Modifier.pressable(RoundedCornerShape(0.dp), enabled, onClick)) { Text(label, style = LoType.body, color = color) }
}

@Composable
fun SettingsScreen() {
    val lo = LocalLo.current
    val nav = LocalNav.current
    val sync = LocalSync.current
    val scope = rememberCoroutineScope()
    val fallback = remember { kotlinx.coroutines.flow.MutableStateFlow(com.lomu.app.sync.SyncState()) }
    val st by (sync?.state ?: fallback).collectAsState()
    var url by remember(st.serverUrl) { mutableStateOf(st.serverUrl) }
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var probe by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var probing by remember { mutableStateOf(false) }
    LaunchedEffect(url, st.user) {
        if (st.user != null || url.isBlank()) { probe = null; return@LaunchedEffect }
        delay(600)
        probing = true
        probe = sync?.ping(url)
        probing = false
    }
    Column(Modifier.fillMaxSize().background(lo.grouped).verticalScroll(rememberScrollState()).padding(bottom = 32.dp)) {
        PageTitle("", "Settings")
        if (st.user != null) {
            Group("Account", footer = st.error ?: st.status) {
                Cell {
                    IconTile(Ph.User, lo.signal, 36.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(st.user.orEmpty(), style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = lo.ink)
                        Text("Your LoMu server", style = LoType.small, color = lo.grey)
                    }
                }
                Hairline(16.dp)
                ActionCell(if (st.busy) "Syncing…" else "Sync Now", lo.signal) { scope.launch { sync?.sync() } }
                Hairline(16.dp)
                ActionCell("Sign Out", lo.red) { sync?.signOut() }
            }
        } else {
            val note = if (probing) "Checking the server…" else probe?.second ?: "One owner account on your own LoMu server."
            Group("Account", footer = st.error ?: note) {
                CellField(url, { url = it }, "Server, e.g. https://lomu.example.com")
                Hairline(16.dp)
                CellField(user, { user = it }, "Username")
                Hairline(16.dp)
                CellField(pass, { pass = it }, "Password", password = true)
            }
            Group(null) {
                ActionCell(if (st.busy) "Working…" else "Sign In", lo.signal) { scope.launch { sync?.signIn(url, user, pass, false); sync?.sync() } }
                Hairline(16.dp)
                ActionCell("Create Account", lo.signal) { scope.launch { sync?.signIn(url, user, pass, true); sync?.sync() } }
            }
        }
        Group("Library", footer = "Copy your liked songs and playlists once. The Google session is discarded afterwards.") {
            Cell(Modifier.pressable(RoundedCornerShape(0.dp)) { nav.push(Screen.Import) }) {
                IconTile(Ph.Download, Color(0xFF34C759))
                Spacer(Modifier.width(14.dp))
                Text("Import from YouTube Music", style = LoType.body, color = lo.ink, modifier = Modifier.weight(1f))
                Icon(Icons.Rounded.ChevronRight, null, tint = lo.grey.copy(alpha = 0.7f), modifier = Modifier.size(20.dp))
            }
        }
        Group("About") {
            Cell {
                IconTile(Ph.Waveform, lo.signal)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text("LoMu", style = LoType.body, color = lo.ink)
                    Text("Plays anonymously from YouTube Music. No ads, no Google account.", style = LoType.small, color = lo.grey)
                }
            }
        }
    }
}
