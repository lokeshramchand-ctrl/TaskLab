package com.lomu.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Search

@Composable
fun Welcome(onStart: () -> Unit) {
    val lo = LocalLo.current
    Column(Modifier.fillMaxSize().background(lo.bg).statusBarsPadding().navigationBarsPadding().padding(horizontal = 28.dp, vertical = 24.dp)) {
        Spacer(Modifier.weight(1f))
        Box(Modifier.size(72.dp).background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFF5AC8FA), lo.signal)), RoundedCornerShape(17.dp)), Alignment.Center) {
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
        Pill("Continue", onStart, accent = true, modifier = Modifier.fillMaxWidth().height(52.dp))
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
    val remote = rememberRemote()
    var showDevices by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf<MenuTarget?>(null) }

    if (welcome) {
        Welcome { welcome = false; onWelcomeDone() }
        return
    }
    BackHandler(enabled = menu != null || showDevices || showPlayer || nav.canPop) {
        if (menu != null) menu = null else if (showDevices) showDevices = false else if (showPlayer) showPlayer = false else nav.pop()
    }
    // Tab bar 58dp + gaps, plus the mini player capsule (48dp) when something is loaded.
    val hasPlayer = meta != null || remote != null
    val insetBase by androidx.compose.animation.core.animateDpAsState(if (hasPlayer) 138.dp else 82.dp, tween(380, easing = IosEase), label = "inset")
    val inset = insetBase + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    CompositionLocalProvider(LocalNav provides nav, LocalBottomInset provides inset, LocalOpenDevices provides { showDevices = true }, LocalTrackMenu provides { menu = it }) {
        Box(Modifier.fillMaxSize().background(lo.bg)) {
            AnimatedContent(
                targetState = nav.current,
                transitionSpec = {
                    when (nav.op) {
                        // Push: the new page slides in over the old one, which drifts left and dims (iOS / Apple Music).
                        NavOp.Push -> (slideInHorizontally(tween(430, easing = IosEase)) { it } + fadeIn(tween(160)))
                            .togetherWith(slideOutHorizontally(tween(430, easing = IosEase)) { -it / 4 } + fadeOut(tween(430), targetAlpha = 0.55f))
                            .apply { targetContentZIndex = 1f }
                        NavOp.Pop -> (slideInHorizontally(tween(430, easing = IosEase)) { -it / 4 } + fadeIn(tween(430), initialAlpha = 0.55f))
                            .togetherWith(slideOutHorizontally(tween(380, easing = IosEase)) { it } + fadeOut(tween(260, delayMillis = 120)))
                            .apply { targetContentZIndex = -1f }
                        // Tabs: a quick cross-fade with the slightest settle.
                        NavOp.Tab -> (fadeIn(tween(240, delayMillis = 60)) + scaleIn(tween(300, easing = IosEase), initialScale = 0.985f)) togetherWith fadeOut(tween(120))
                    }
                },
                label = "screen",
                modifier = Modifier.fillMaxSize(),
            ) { screen ->
                Box(Modifier.fillMaxSize().background(lo.bg)) {
                when (screen) {
                    Screen.Home -> HomeScreen()
                    Screen.New -> NewScreen()
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
            // Swipe in from the left edge to go back.
            if (nav.canPop && !showPlayer) Box(Modifier.align(Alignment.CenterStart).fillMaxHeight().width(22.dp).edgeSwipeBack(true) { nav.pop() })
            // Soft fade so rows slide under the floating bars instead of being cut off.
            Box(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(inset + 8.dp)
                    .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, lo.bg.copy(alpha = 0.92f), lo.bg))),
            )
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 14.dp).padding(bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AnimatedVisibility(
                    visible = hasPlayer,
                    enter = slideInVertically(tween(450, easing = IosEase)) { it / 2 } + fadeIn(tween(250)) + scaleIn(spring(dampingRatio = 0.7f, stiffness = 300f), initialScale = 0.9f),
                    exit = slideOutVertically(tween(300, easing = IosEase)) { it / 2 } + fadeOut(tween(200)),
                ) {
                    if (remote != null) RemoteMiniPlayer(remote, { showPlayer = true })
                    else MiniPlayer({ showPlayer = true })
                }
                TabBar(nav)
            }
            AnimatedVisibility(
                visible = showPlayer,
                enter = slideInVertically(tween(480, easing = IosEase)) { it } + fadeIn(tween(220)),
                exit = slideOutVertically(tween(340, easing = IosEase)) { it } + fadeOut(tween(260)),
            ) { if (remote != null) RemotePlayer(remote) { showPlayer = false } else FullPlayer { showPlayer = false } }
            if (showDevices) DevicesSheet { showDevices = false }
            menu?.let { t -> TrackMenuSheet(t, { menu = null }) { s -> showPlayer = false; nav.push(s) } }
        }
    }
}

private data class TabDef(val label: String, val on: ImageVector, val off: ImageVector, val screen: Screen)

/**
 * Floating glass capsule with the tabs. As in the reference, every glyph is a bold filled symbol,
 * the selected tab sits in a grey pill and turns blue, labels are 10pt bold.
 */
@Composable
private fun TabBar(nav: Nav) {
    val lo = LocalLo.current
    val tabs = listOfNotNull(
        TabDef("Home", Lin.Focus.vector, Lin.Focus.vector, Screen.Home),
        if (UiPrefs.showNew(LocalContext.current)) TabDef("New", Lin.Projects.vector, Lin.Projects.vector, Screen.New) else null,
        TabDef("Library", Lin.Views.vector, Lin.Views.vector, Screen.Library),
        TabDef("Search", Lin.Search.vector, Lin.Search.vector, Screen.Search),
    )
    val shape = RoundedCornerShape(36.dp)
    val haptic = rememberHaptic()
    Row(Modifier.fillMaxWidth().height(58.dp).glass(shape, lo).padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
        tabs.forEach { t ->
            val active = nav.stack.first() == t.screen
            val tint by animateColorAsState(if (active) lo.signal else lo.ink, tween(220), label = "tabTint")
            val pill by animateColorAsState(if (active) lo.surface2 else Color.Transparent, tween(260), label = "tabPill")
            val pop by androidx.compose.animation.core.animateFloatAsState(if (active) 1.14f else 1f, spring(dampingRatio = 0.4f, stiffness = 380f), label = "tabPop")
            Column(
                Modifier.weight(1f).fillMaxHeight()
                    .background(pill, RoundedCornerShape(30.dp))
                    .pressable(RoundedCornerShape(30.dp)) { if (!active) haptic(false); nav.tab(t.screen) },
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
            ) {
                IcV(if (active) t.on else t.off, 24.dp, tint, Modifier.graphicsLayer { scaleX = pop; scaleY = pop })
                Text(t.label, style = LoType.caption.copy(fontWeight = FontWeight.Bold, lineHeight = 12.sp), color = tint, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}
