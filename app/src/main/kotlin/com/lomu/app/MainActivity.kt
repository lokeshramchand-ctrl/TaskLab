/**
 * LoMu (C) 2026 — derived from BeatWave, licensed under GPL-3.0
 */

package com.lomu.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.lomu.app.db.MusicDatabase
import com.lomu.app.lyrics.LyricsHelper
import com.lomu.app.playback.MusicService
import com.lomu.app.playback.PlayerConnection
import com.lomu.app.ui.LocalLyrics
import com.lomu.app.ui.LocalPlayer
import com.lomu.app.ui.LoMuRoot
import com.lomu.app.ui.LoMuTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var database: MusicDatabase
    @Inject lateinit var lyricsHelper: LyricsHelper
    @Inject lateinit var syncClient: com.lomu.app.sync.SyncClient
    @Inject lateinit var importer: com.lomu.app.sync.YtmImporter
    @Inject lateinit var connectClient: com.lomu.app.sync.ConnectClient

    private var connection by mutableStateOf<PlayerConnection?>(null)

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, service: IBinder) {
            if (service is MusicService.MusicBinder) {
                connection = PlayerConnection(this@MainActivity, service, database, lifecycleScope)
                connectClient.attach(connection)
            }
        }

        override fun onServiceDisconnected(name: ComponentName) {
            connection?.dispose()
            connection = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        val intent = Intent(this, MusicService::class.java)
        startService(intent)
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)

        // Sync on start and then every minute while the app is on screen.
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    syncClient.sync()
                    connectClient.start() // no-op while already connected or signed out
                    delay(60_000)
                }
            }
        }

        val prefs = getSharedPreferences("lomu", MODE_PRIVATE)
        setContent {
            LoMuTheme {
                CompositionLocalProvider(LocalPlayer provides connection, LocalLyrics provides lyricsHelper, com.lomu.app.ui.LocalSync provides syncClient, com.lomu.app.ui.LocalConnect provides connectClient, com.lomu.app.ui.LocalImporter provides importer) {
                    LoMuRoot(
                        seenWelcome = prefs.getBoolean("seenWelcome", false),
                        onWelcomeDone = { prefs.edit().putBoolean("seenWelcome", true).apply() },
                    )
                }
            }
        }
    }

    /** While this phone steers another device, its volume buttons change that device's volume. */
    override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
        val up = event.keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP
        if ((up || event.keyCode == android.view.KeyEvent.KEYCODE_VOLUME_DOWN) && event.action == android.view.KeyEvent.ACTION_DOWN) {
            if (connectClient.nudgeRemoteVolume(if (up) 0.06 else -0.06)) return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onStop() {
        connectClient.stopIfIdle()
        super.onStop()
    }

    override fun onDestroy() {
        connectClient.attach(null)
        runCatching { unbindService(serviceConnection) }
        connection?.dispose()
        connection = null
        super.onDestroy()
    }
}
