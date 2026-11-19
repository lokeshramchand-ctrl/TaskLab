package com.lomu.app.sync

import com.lomu.app.db.MusicDatabase
import com.lomu.app.db.entities.PlaylistEntity
import com.lomu.app.db.entities.PlaylistSongMap
import com.lomu.app.models.toMediaMetadata
import com.music.innertube.YouTube
import com.music.innertube.models.PlaylistItem
import com.music.innertube.models.SongItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.time.LocalDateTime
import javax.inject.Inject
import javax.inject.Singleton

data class ImportSummary(val likedSongs: Int, val playlists: Int, val songs: Int)

/**
 * One-time import of a YouTube Music account: liked songs and library playlists are copied
 * into LoMu's own database. The Google session cookie is used only for the duration of this
 * call and is cleared afterwards, whatever the outcome; LoMu never keeps it.
 */
@Singleton
class YtmImporter @Inject constructor(private val database: MusicDatabase) {

    suspend fun import(cookie: String, progress: (String) -> Unit): Result<ImportSummary> = withContext(Dispatchers.IO) {
        val previous = YouTube.cookie
        YouTube.cookie = cookie
        try {
            runCatching {
                progress("Reading liked songs…")
                val liked = fetchAll("LM")
                liked.forEach { s -> saveSong(s, liked = true) }

                progress("Reading playlists…")
                val lists = fetchPlaylists()
                var songTotal = liked.size
                lists.forEachIndexed { i, p ->
                    progress("Playlist ${i + 1} of ${lists.size}: ${p.title}")
                    val songs = fetchAll(p.id.removePrefix("VL"))
                    songTotal += songs.size
                    savePlaylist(p, songs)
                }
                if (songTotal == 0 && lists.isEmpty()) {
                    error("Nothing was found in this account. Check that you signed in to the right Google account and that it has liked songs or playlists on YouTube Music.")
                }
                ImportSummary(liked.size, lists.size, songTotal)
            }
        } finally {
            YouTube.cookie = previous
        }
    }

    private suspend fun fetchPlaylists(): List<PlaylistItem> {
        val out = mutableListOf<PlaylistItem>()
        var page = YouTube.library("FEmusic_liked_playlists").getOrNull() ?: return out
        out += page.items.filterIsInstance<PlaylistItem>()
        var cont = page.continuation
        while (cont != null) {
            val next = YouTube.libraryContinuation(cont).getOrNull() ?: break
            out += next.items.filterIsInstance<PlaylistItem>()
            cont = next.continuation
        }
        // "Liked music" and "Episodes for later" are system lists, not user playlists.
        return out.filter { it.id.removePrefix("VL") !in setOf("LM", "SE") }.distinctBy { it.id }
    }

    private suspend fun fetchAll(playlistId: String): List<SongItem> {
        val first = YouTube.playlist(playlistId).getOrNull() ?: return emptyList()
        val songs = first.songs.toMutableList()
        var cont = first.songsContinuation ?: first.continuation
        while (cont != null) {
            val next = YouTube.playlistContinuation(cont).getOrNull() ?: break
            songs += next.songs
            cont = next.continuation
        }
        return songs.distinctBy { it.id }
    }

    private suspend fun saveSong(s: SongItem, liked: Boolean) {
        database.withTransaction {
            if (song(s.id).first() == null) insert(s.toMediaMetadata())
            val row = song(s.id).first()?.song ?: return@withTransaction
            if (liked && !row.liked) update(row.copy(liked = true, likedDate = LocalDateTime.now(), inLibrary = row.inLibrary ?: LocalDateTime.now()))
        }
    }

    private suspend fun savePlaylist(p: PlaylistItem, songs: List<SongItem>) {
        database.withTransaction {
            val entity = PlaylistEntity(
                name = p.title,
                browseId = null, // a local copy, not linked back to the Google account
                isEditable = true,
                isLocal = true,
                bookmarkedAt = LocalDateTime.now(),
                thumbnailUrl = p.thumbnail,
                remoteSongCount = songs.size,
            )
            insert(entity)
            songs.forEachIndexed { i, s ->
                if (song(s.id).first() == null) insert(s.toMediaMetadata())
                insert(PlaylistSongMap(playlistId = entity.id, songId = s.id, position = i))
            }
        }
    }
}
