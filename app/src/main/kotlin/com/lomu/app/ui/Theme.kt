package com.lomu.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * LoMu design tokens, modelled on Apple Music: pure white / true black canvas, iOS system greys,
 * hairline separators, grouped inset cells and one red accent.
 */
data class Lo(
    val bg: Color,          // page canvas
    val card: Color,        // elevated surface (bars, mini player, sheets)
    val surface2: Color,    // fills: search field, art placeholder, segmented track
    val grouped: Color,     // background of grouped (Settings style) pages
    val cell: Color,        // grouped cell background
    val ink: Color,         // primary label
    val grey: Color,        // secondary label
    val line: Color,        // hairline separator
    val border2: Color,     // stronger outline
    val signal: Color,      // accent (Apple Music red)
    val signalSoft: Color,  // accent tint for fills
    val red: Color,         // destructive / error
    val dark: Boolean,
)

val LightLo = Lo(
    bg = Color(0xFFFFFFFF), card = Color(0xFFFAFAFA), surface2 = Color(0xFFEEEEF0),
    grouped = Color(0xFFF2F2F7), cell = Color(0xFFFFFFFF),
    ink = Color(0xFF000000), grey = Color(0xFF8E8E93), line = Color(0xFFC6C6C8), border2 = Color(0xFFC6C6C8),
    signal = Color(0xFFFF2D55), signalSoft = Color(0x1FFF2D55), red = Color(0xFFFF3B30), dark = false,
)
val DarkLo = Lo(
    bg = Color(0xFF000000), card = Color(0xFF222222), surface2 = Color(0xFF2C2C2E),
    grouped = Color(0xFF000000), cell = Color(0xFF1C1C1E),
    ink = Color(0xFFFFFFFF), grey = Color(0xFF9A9AA0), line = Color(0xFF38383A), border2 = Color(0xFF444446),
    signal = Color(0xFFFF375F), signalSoft = Color(0x2EFF375F), red = Color(0xFFFF453A), dark = true,
)

val LocalLo = staticCompositionLocalOf { LightLo }

/** Type scale after the iOS text styles: Large Title, Title 2, Headline, Body, Subhead, Footnote. */
object LoType {
    val hero = TextStyle(fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 41.sp, letterSpacing = 0.37.sp)       // Large Title
    val title = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = 0.35.sp)       // Title 2
    val section = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = 0.35.sp)
    val body = TextStyle(fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 22.sp, letterSpacing = (-0.41).sp)  // Body
    val small = TextStyle(fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 16.sp, letterSpacing = (-0.08).sp) // Footnote
    val eyebrow = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 16.sp, letterSpacing = (-0.08).sp)
    val sub = TextStyle(fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 20.sp, letterSpacing = (-0.24).sp)    // Subheadline
    val caption = TextStyle(fontWeight = FontWeight.Medium, fontSize = 10.sp, lineHeight = 12.sp, letterSpacing = 0.07.sp)   // Caption 3 (tab labels)
}

@Composable
fun LoMuTheme(content: @Composable () -> Unit) {
    val lo = if (isSystemInDarkTheme()) DarkLo else LightLo
    val scheme = if (lo.dark) darkColorScheme(background = lo.bg, surface = lo.card, primary = lo.signal, onPrimary = Color.White, onBackground = lo.ink, onSurface = lo.ink)
    else lightColorScheme(background = lo.bg, surface = lo.card, primary = lo.signal, onPrimary = Color.White, onBackground = lo.ink, onSurface = lo.ink)
    MaterialTheme(colorScheme = scheme) {
        CompositionLocalProvider(LocalLo provides lo, content = content)
    }
}
