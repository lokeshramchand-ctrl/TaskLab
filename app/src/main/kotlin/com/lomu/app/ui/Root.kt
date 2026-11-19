package com.lomu.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Search

@Composable
fun Welcome(onStart: () -> Unit) {
    val lo = LocalLo.current
    Column(Modifier.fillMaxSize().background(lo.bg).statusBarsPadding().navigationBarsPadding().padding(horizontal = 28.dp, vertical = 24.dp)) {
        Spacer(Modifier.weight(1f))
        Box(Modifier.size(72.dp).background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFFFF5E7A), lo.signal)), RoundedCornerShape(17.dp)), Alignment.Center) {
            IcV(androidx.compose.material.icons.Icons.Rounded.MusicNote, 40.dp, Color.White)
        }
        Spacer(Modifier.height(24.dp))
        Text("Welcome to LoMu", style = LoType.hero, color = lo.ink)
        Text("Your music, everywhere.", style = LoType.body.copy(fontSize = 20.sp, lineHeight = 25.sp), color = lo.grey, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(32.dp))
        listOf(
            Ph.Headphones to ("Listen anonymously" to "Plays from YouTube Music. No ads, no Google account."),
            Ph.Cloud to ("Synced to you" to "Likes and playlists sync to your own server."),
            Ph.Sparkles to ("Made for you" to "Mixes, radio and lyrics that learn what you like."),
        ).forEach { (icon, text) ->
            Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.Top) {
                Ic(icon, 30.dp, lo.signal, Modifier.padding(top = 2.dp))
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(text.first, style = LoType.body.copy(fontWeight = FontWeight.SemiBold), color = lo.ink)
                    Text(text.second, style = LoType.sub, color = lo.grey)
                }
            }
        }
        Spacer(Modifier.weight(1f))
        Pill("Continue", onStart, modifier = Modifier.fillMaxWidth().height(52.dp))
    }
}

@Composable
fun LoMuRoot(seenWelcome: Boolean, onWelcomeDone: () -> Unit) {
    val lo = LocalLo.current
    val nav = remember { Nav() }
    var showPlayer by remember { mutableStateOf(false) }
    var welcome by remember { mutableStateOf(!seenWelcome) }
    val pc = LocalPlayer.current
    val meta = pc?.mediaMetadata?.collectAsState()?.value

    if (welcome) {
        Welcome { welcome = false; onWelcomeDone() }
        return
    }
    BackHandler(enabled = showPlayer || nav.canPop) {
        if (showPlayer) showPlayer = false else nav.pop()
    }
    CompositionLocalProvider(LocalNav provides nav) {
        Box(Modifier.fillMaxSize().background(lo.bg)) {
            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f)) {
                    AnimatedContent(
                        targetState = nav.current,
                        transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(120)) },
                        label = "screen",
                    ) { screen ->
                        when (screen) {
                            Screen.Home -> HomeScreen()
                            Screen.Search -> SearchScreen()
                            Screen.Library -> LibraryScreen()
                            Screen.Settings -> SettingsScreen()
                            is Screen.Album -> AlbumScreen(screen.id)
                            is Screen.Artist -> ArtistScreen(screen.id)
                            is Screen.Playlist -> PlaylistScreen(screen.id)
                            is Screen.LocalPlaylist -> LocalPlaylistScreen(screen.id)
                            Screen.Import -> ImportScreen()
                            Screen.Liked -> LikedScreen()
                            Screen.Playlists -> PlaylistsScreen()
                        }
                    }
                }
                if (meta != null) MiniPlayer({ showPlayer = true })
                TabBar(nav)
            }
            AnimatedVisibility(
                visible = showPlayer,
                enter = slideInVertically(tween(320)) { it } + fadeIn(tween(200)),
                exit = slideOutVertically(tween(260)) { it } + fadeOut(tween(200)),
            ) { FullPlayer { showPlayer = false } }
        }
    }
}

private data class TabDef(val label: String, val on: ImageVector, val off: ImageVector, val screen: Screen)

@Composable
private fun TabBar(nav: Nav) {
    val lo = LocalLo.current
    val tabs = listOf(
        TabDef("Listen Now", Icons.Filled.PlayCircle, Icons.Outlined.PlayCircle, Screen.Home),
        TabDef("Search", Icons.Rounded.Search, Icons.Rounded.Search, Screen.Search),
        TabDef("Library", Icons.Filled.LibraryMusic, Icons.Outlined.LibraryMusic, Screen.Library),
        TabDef("Settings", Icons.Filled.Settings, Icons.Outlined.Settings, Screen.Settings),
    )
    Column(Modifier.fillMaxWidth().background(lo.card)) {
        Hairline()
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(top = 6.dp, bottom = 4.dp)) {
            tabs.forEach { t ->
                val active = nav.stack.first() == t.screen
                val tint = if (active) lo.signal else lo.grey
                Column(
                    Modifier.weight(1f).pressable(RoundedCornerShape(8.dp)) { nav.tab(t.screen) }.padding(vertical = 2.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    IcV(if (active) t.on else t.off, 26.dp, tint)
                    Text(t.label, style = LoType.caption, color = tint, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
    }
}
