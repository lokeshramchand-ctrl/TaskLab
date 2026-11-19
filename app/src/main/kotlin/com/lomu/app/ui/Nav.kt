package com.lomu.app.ui

import androidx.compose.runtime.mutableStateListOf

sealed interface Screen {
    data object Home : Screen
    data object New : Screen
    data object Search : Screen
    data object Library : Screen
    data object Settings : Screen
    data class Album(val id: String) : Screen
    data class Artist(val id: String) : Screen
    data class Playlist(val id: String) : Screen
    data class LocalPlaylist(val id: String) : Screen
    data object Import : Screen
    data object Liked : Screen
    data object Playlists : Screen
}

/** Tiny back stack: the bottom entry is the current tab, the rest are pushed detail pages. */
class Nav {
    val stack = mutableStateListOf<Screen>(Screen.Home)
    val current: Screen get() = stack.last()
    val canPop get() = stack.size > 1
    fun push(s: Screen) { stack.add(s) }
    fun pop() { if (canPop) stack.removeAt(stack.lastIndex) }
    fun tab(s: Screen) { stack.clear(); stack.add(s) }
}
