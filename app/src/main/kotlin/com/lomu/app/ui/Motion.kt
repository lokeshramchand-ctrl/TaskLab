package com.lomu.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/* The motion language of the app, modelled on iOS / Apple Music: the "iOS ease" curve for pushes and
   sheets, springs for taps and toggles, light haptics on the controls you press most. */

/** The curve iOS uses for navigation pushes and sheet presentations. */
val IosEase = CubicBezierEasing(0.32f, 0.72f, 0f, 1f)

enum class NavOp { Tab, Push, Pop }

/** Light tick for toggles and taps; [strong] for opening menus and finishing gestures. */
@Composable
fun rememberHaptic(): (strong: Boolean) -> Unit {
    val h = LocalHapticFeedback.current
    return remember(h) { { strong -> h.performHapticFeedback(if (strong) HapticFeedbackType.LongPress else HapticFeedbackType.TextHandleMove) } }
}

// ---------------------------------------------------------------- sheets

class SheetState internal constructor(private val scope: CoroutineScope, private val onClosed: () -> Unit) {
    var shown by mutableStateOf(false)
        internal set

    /** Slides the sheet down, then reports it closed. */
    fun dismiss() {
        if (!shown) return
        shown = false
        scope.launch { delay(260); onClosed() }
    }
}

@Composable
fun rememberSheetState(onClosed: () -> Unit): SheetState {
    val scope = rememberCoroutineScope()
    return remember { SheetState(scope, onClosed) }
}

/** Bottom sheet with a fading scrim and an iOS-style slide up; [content] is the sheet body. */
@Composable
fun SheetHost(sheet: SheetState, content: @Composable ColumnScope.() -> Unit) {
    val lo = LocalLo.current
    LaunchedEffect(Unit) { sheet.shown = true }
    val scrim by animateFloatAsState(if (sheet.shown) 0.45f else 0f, tween(280), label = "scrim")
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = scrim)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { sheet.dismiss() },
        Alignment.BottomCenter,
    ) {
        AnimatedVisibility(
            visible = sheet.shown,
            enter = slideInVertically(tween(420, easing = IosEase)) { it } + fadeIn(tween(160)),
            exit = slideOutVertically(tween(250, easing = IosEase)) { it } + fadeOut(tween(200)),
        ) {
            Column(
                Modifier.fillMaxWidth().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                    .background(lo.card, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)).navigationBarsPadding().padding(horizontal = 20.dp, vertical = 14.dp),
                content = content,
            )
        }
    }
}

// ---------------------------------------------------------------- lists

/** Rows rise and fade in the first time they appear, a little later each (up to the tenth), then stay put. */
fun Modifier.appear(index: Int = 0): Modifier = composed {
    var seen by rememberSaveable { mutableStateOf(false) }
    val p = remember { Animatable(if (seen) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (!seen) {
            delay(minOf(index, 10) * 32L)
            p.animateTo(1f, tween(420, easing = IosEase))
            seen = true
        }
    }
    graphicsLayer {
        alpha = p.value
        translationY = (1f - p.value) * 22.dp.toPx()
    }
}

// ---------------------------------------------------------------- controls

/** Play / pause glyph that springs from one to the other. */
@Composable
fun PlayPauseIcon(playing: Boolean, size: Dp, tint: Color = LocalLo.current.ink) {
    AnimatedContent(
        targetState = playing,
        transitionSpec = {
            (scaleIn(spring(dampingRatio = 0.55f, stiffness = 520f), initialScale = 0.4f) + fadeIn(tween(120))) togetherWith
                (scaleOut(tween(110), targetScale = 0.4f) + fadeOut(tween(90)))
        },
        label = "playpause",
    ) { p -> IcV(if (p) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, size, tint) }
}

/** Round play / pause button with a haptic tick. */
@Composable
fun PlayPauseBtn(playing: Boolean, onClick: () -> Unit, size: Dp, iconSize: Dp, tint: Color = LocalLo.current.ink) {
    val haptic = rememberHaptic()
    Box(Modifier.size(size).pressable(androidx.compose.foundation.shape.CircleShape) { haptic(false); onClick() }, Alignment.Center) { PlayPauseIcon(playing, iconSize, tint) }
}

/** Heart that pops (scales up, then settles) when it becomes liked. */
@Composable
fun HeartPop(liked: Boolean, size: Dp, on: Color, off: Color) {
    val scale = remember { Animatable(1f) }
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(liked) {
        if (first) { first = false; return@LaunchedEffect }
        if (liked) {
            scale.animateTo(1.45f, spring(dampingRatio = 0.35f, stiffness = 900f))
            scale.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 320f))
        } else {
            scale.animateTo(0.8f, tween(90))
            scale.animateTo(1f, spring(dampingRatio = 0.5f, stiffness = 400f))
        }
    }
    IcV(if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, size, if (liked) on else off, Modifier.graphicsLayer { scaleX = scale.value; scaleY = scale.value })
}

// ---------------------------------------------------------------- gestures

/** Swipe in from the left edge to go back, like the iOS navigation controller. */
fun Modifier.edgeSwipeBack(enabled: Boolean, onBack: () -> Unit): Modifier = if (!enabled) this else pointerInput(Unit) {
    var dx = 0f
    detectHorizontalDragGestures(
        onDragStart = { dx = 0f },
        onDragEnd = { if (dx > 90.dp.toPx()) onBack() },
        onDragCancel = { dx = 0f },
    ) { _, delta -> dx += delta }
}

/**
 * Pull-down-to-dismiss for a full-screen sheet such as the player. The content follows the finger through
 * [offset]; letting go past a third of the way (or with a quick flick) slides it away and calls [onDismiss],
 * otherwise it springs back. Apply the returned modifier to the grab area and read [offset] in the sheet's
 * graphicsLayer.
 */
@Composable
fun rememberDismissDrag(onDismiss: () -> Unit): Pair<Animatable<Float, androidx.compose.animation.core.AnimationVector1D>, Modifier> {
    val offset = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val screenH = with(LocalDensity.current) { LocalConfiguration.current.screenHeightDp.dp.toPx() }
    var lastDy by remember { mutableStateOf(0f) }
    val mod = Modifier.pointerInput(Unit) {
        detectVerticalDragGestures(
            onDragStart = { lastDy = 0f },
            onDragEnd = {
                scope.launch {
                    if (offset.value > screenH / 4f || lastDy > 14f) {
                        offset.animateTo(screenH, tween(240, easing = IosEase))
                        onDismiss()
                    } else offset.animateTo(0f, spring(dampingRatio = 0.75f, stiffness = 420f))
                }
            },
            onDragCancel = { scope.launch { offset.animateTo(0f, spring(dampingRatio = 0.75f, stiffness = 420f)) } },
        ) { change, dy ->
            change.consume()
            lastDy = dy
            scope.launch { offset.snapTo((offset.value + dy).coerceAtLeast(0f)) }
        }
    }
    return offset to mod
}
