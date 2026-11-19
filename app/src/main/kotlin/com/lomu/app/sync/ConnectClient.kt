package com.lomu.app.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.ContextCompat
import android.media.AudioManager
import android.os.Build
import androidx.media3.common.Player
import com.lomu.app.extensions.metadata
import com.lomu.app.extensions.toMediaItem
import com.lomu.app.models.MediaMetadata
import com.lomu.app.playback.PlayerConnection
import com.lomu.app.playback.queues.ListQueue
import com.lomu.app.playback.queues.YouTubeQueue
import com.music.innertube.models.WatchEndpoint
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** One device signed in to the account, as the server describes it. */
data class Dev(
    val id: String,
    val name: String,
    val kind: String,
    val track: MediaMetadata?,
    val playing: Boolean,
    val position: Double, // seconds, when the list arrived
    val duration: Double,
    val volume: Double,
    val shuffle: Boolean,
    val repeat: String,
    val receivedAt: Long,
)

data class DevicesState(val list: List<Dev> = emptyList(), val active: String? = null, val online: Boolean = false)

/**
 * Spotify-Connect style link to the other devices on this account (protocol: web/src/server/connect.ts).
 * Holds one server-sent-events connection while the app is on screen (or music is playing), reports
 * what this phone plays, executes commands from other devices, and sends commands to them.
 */
@Singleton
class ConnectClient @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sync: SyncClient,
) {
    private val prefs = context.getSharedPreferences("lomu_connect", Context.MODE_PRIVATE)
    val selfId: String = prefs.getString("id", null) ?: ("android-" + UUID.randomUUID()).also { prefs.edit().putString("id", it).apply() }
    private val selfName = (Build.MODEL ?: "Android phone").take(40)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var job: Job? = null
    private var reporter: Job? = null
    private var pc: PlayerConnection? = null
    private val seekTick = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    private val _devices = MutableStateFlow(DevicesState())
    val devices: StateFlow<DevicesState> = _devices.asStateFlow()

    /** The device the user chose to control from this phone (null = this phone). */
    private val _target = MutableStateFlow<String?>(null)
    val target: StateFlow<String?> = _target.asStateFlow()

    private val localPlaying = MutableStateFlow(false)
    private val volumeTick = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    private var volReceiver: BroadcastReceiver? = null
    private var volObserver: ContentObserver? = null

    /** Tells the other devices whenever this phone's media volume changes (buttons, slider, command). */
    private fun watchVolume(on: Boolean) {
        volReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        volReceiver = null
        volObserver?.let { context.contentResolver.unregisterContentObserver(it) }
        volObserver = null
        if (!on) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) { volumeTick.tryEmit(Unit) }
        }
        ContextCompat.registerReceiver(context, r, IntentFilter("android.media.VOLUME_CHANGED_ACTION"), ContextCompat.RECEIVER_NOT_EXPORTED)
        val o = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { volumeTick.tryEmit(Unit) }
        }
        context.contentResolver.registerContentObserver(Settings.System.CONTENT_URI, true, o)
        volReceiver = r
        volObserver = o
    }

    private var volumeGuess: Triple<String, Double, Long>? = null
    private var volumeToast: Toast? = null

    /**
     * The phone's hardware volume buttons while it steers another device: they change that device's
     * volume (as in Spotify Connect). Returns false when nothing is steered, so Android handles the key.
     */
    fun nudgeRemoteVolume(delta: Double): Boolean {
        val r = remote.value ?: return false
        val now = System.currentTimeMillis()
        // Quick presses add up before the device has had time to report its new volume.
        val base = volumeGuess?.takeIf { it.first == r.id && now - it.third < 1500 }?.second ?: r.volume
        val v = (base + delta).coerceIn(0.0, 1.0)
        volumeGuess = Triple(r.id, v, now)
        send(r.id, JSONObject().put("type", "volume").put("volume", v))
        volumeToast?.cancel()
        volumeToast = Toast.makeText(context, "${r.name} · volume ${(v * 100).toInt()}%", Toast.LENGTH_SHORT).also { it.show() }
        return true
    }

    /**
     * The device this phone is steering. It is chosen in the device list, or latched automatically when
     * another device starts playing while nothing plays here. Once set it stays (also while that device
     * is paused) until you pick "This phone", play here, or the device goes offline.
     */
    val remote: StateFlow<Dev?> = combine(_devices, _target) { d, t -> t?.let { id -> d.list.find { it.id == id } } }
        .stateIn(scope, SharingStarted.Eagerly, null)

    private var suppressLatchUntil = 0L

    private fun latch(d: DevicesState) {
        if (_target.value != null || localPlaying.value || System.currentTimeMillis() < suppressLatchUntil) return
        d.list.firstOrNull { it.id != selfId && it.playing }?.let { _target.value = it.id }
    }

    init {
        instance = this
        scope.launch { _devices.collect { latch(it) } }
    }

    companion object {
        /** Lets the plain `playList` / `playRadio` helpers route to a remote device without a context. */
        @Volatile var instance: ConnectClient? = null
    }

    fun attach(connection: PlayerConnection?) {
        reporter?.cancel()
        watchVolume(connection != null)
        pc = connection
        val c = connection ?: return
        c.player.addListener(object : Player.Listener {
            override fun onPositionDiscontinuity(o: Player.PositionInfo, n: Player.PositionInfo, reason: Int) {
                if (reason == Player.DISCONTINUITY_REASON_SEEK) seekTick.tryEmit(Unit)
            }
        })
        reporter = scope.launch {
            // Report on every change that matters, and every 5 seconds while playing so progress stays true.
            launch {
                combine(c.mediaMetadata, c.isPlaying, c.shuffleModeEnabled, c.repeatMode) { m, p, s, r -> listOf(m?.id, p, s, r) }
                    .distinctUntilChanged().debounce(150).collect { report() }
            }
            launch { seekTick.debounce(150).collect { report() } }
            launch { volumeTick.debounce(120).collect { report() } } // hardware buttons and the system slider reach the other devices
            launch { while (true) { delay(5000); if (c.isPlaying.value) report() } }
            // Playing here again ends remote control.
            launch { c.isPlaying.collect { localPlaying.value = it; if (it) _target.value = null } }
        }
    }

    fun start() {
        if (job?.isActive == true || !sync.signedIn) return
        job = scope.launch(Dispatchers.IO) {
            while (isActive && sync.signedIn) {
                try { listen() } catch (e: CancellationException) { throw e } catch (_: Exception) { /* retry below */ }
                _devices.value = _devices.value.copy(online = false)
                delay(4000)
            }
        }
    }

    /** Called when the app leaves the screen: keep listening only while music is playing. */
    fun stopIfIdle() {
        if (pc?.isPlaying?.value == true) return
        stop()
    }

    fun stop() {
        job?.cancel(); job = null
        _target.value = null
        _devices.value = DevicesState()
    }

    private suspend fun listen() = withContext(Dispatchers.IO) {
        val q = "id=${enc(selfId)}&name=${enc(selfName)}&kind=android"
        sync.openStream("/api/connect/events?$q").use { r ->
            if (r.code != 200) error("events ${r.code}")
            _devices.value = _devices.value.copy(online = true)
            withContext(Dispatchers.Main) { report() }
            val src = r.body!!.source()
            var event = ""
            while (isActive) {
                val line = src.readUtf8Line() ?: break
                when {
                    line.startsWith("event:") -> event = line.substring(6).trim()
                    line.startsWith("data:") -> {
                        val data = line.substring(5).trim()
                        val e = event
                        runCatching { withContext(Dispatchers.Main) { handle(e, JSONObject(data)) } }
                    }
                }
            }
        }
    }

    private fun handle(event: String, o: JSONObject) {
        when (event) {
            "devices" -> {
                val now = System.currentTimeMillis()
                val arr = o.getJSONArray("devices")
                val list = (0 until arr.length()).map { i ->
                    val d = arr.getJSONObject(i)
                    Dev(
                        d.getString("id"), d.optString("name", "Device"), d.optString("kind", "web"),
                        d.optJSONObject("track")?.let { sync.trackToMetadata(it) },
                        d.optBoolean("playing"), d.optDouble("position", 0.0), d.optDouble("duration", 0.0), d.optDouble("volume", 1.0),
                        d.optBoolean("shuffle"), d.optString("repeat", "off"), now,
                    )
                }
                _devices.value = DevicesState(list, o.optString("active").ifBlank { null }.takeIf { it != "null" }, true)
                if (_target.value != null && list.none { it.id == _target.value }) _target.value = null
            }
            "command" -> run(o.getJSONObject("cmd"))
        }
    }

    // ---------------------------------------------------------------- reporting

    private fun report() {
        val c = pc ?: return
        if (!_devices.value.online) return
        val m = c.mediaMetadata.value
        val p = c.player
        val state = JSONObject()
            .put("track", m?.let { sync.metadataToTrack(it) } ?: JSONObject.NULL)
            .put("playing", c.isPlaying.value && m != null)
            .put("position", p.currentPosition.coerceAtLeast(0) / 1000.0)
            .put("duration", (p.duration.takeIf { it > 0 } ?: ((m?.duration ?: 0) * 1000L)) / 1000.0)
            .put("volume", volume())
            .put("shuffle", p.shuffleModeEnabled)
            .put("repeat", when (p.repeatMode) { Player.REPEAT_MODE_ONE -> "one"; Player.REPEAT_MODE_ALL -> "all"; else -> "off" })
            .put("queueLen", p.mediaItemCount)
        post("/api/connect/state", JSONObject().put("id", selfId).put("state", state))
    }

    private fun volume(): Double {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return am.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
    }

    // ---------------------------------------------------------------- commands we execute

    private fun run(cmd: JSONObject) {
        val c = pc ?: return
        when (cmd.optString("type")) {
            "play" -> c.play()
            "pause" -> c.pause()
            "toggle" -> c.togglePlayPause()
            "next" -> c.seekToNext()
            "prev" -> c.seekToPrevious()
            "seek" -> c.seekTo((cmd.optDouble("position", 0.0) * 1000).toLong())
            "volume" -> {
                val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                am.setStreamVolume(AudioManager.STREAM_MUSIC, (cmd.optDouble("volume", 1.0) * am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)).toInt(), 0)
            }
            "shuffle" -> c.player.shuffleModeEnabled = if (cmd.has("on")) cmd.optBoolean("on") else !c.player.shuffleModeEnabled
            "repeat" -> c.player.repeatMode = when (cmd.optString("mode")) {
                "one" -> Player.REPEAT_MODE_ONE; "all" -> Player.REPEAT_MODE_ALL; "off" -> Player.REPEAT_MODE_OFF
                else -> if (c.player.repeatMode == Player.REPEAT_MODE_OFF) Player.REPEAT_MODE_ALL else Player.REPEAT_MODE_OFF
            }
            "load" -> {
                val items = tracks(cmd.optJSONArray("tracks")).map { it.toMediaItem() }
                if (items.isNotEmpty()) {
                    _target.value = null
                    c.playQueue(ListQueue(null, items, cmd.optInt("index", 0).coerceIn(0, items.size - 1), (cmd.optDouble("position", 0.0) * 1000).toLong()))
                    if (!cmd.optBoolean("play", true)) c.pause()
                }
            }
            "radio" -> cmd.optJSONObject("track")?.let { sync.trackToMetadata(it) }?.let { m ->
                _target.value = null
                c.playQueue(YouTubeQueue(WatchEndpoint(videoId = m.id), m))
            }
            "enqueue" -> tracks(cmd.optJSONArray("tracks")).map { it.toMediaItem() }.let { items ->
                if (c.player.mediaItemCount == 0) c.playQueue(ListQueue(null, items))
                else if (cmd.optBoolean("next")) c.playNext(items) else c.addToQueue(items)
            }
            "handoff" -> cmd.optString("to").takeIf { it.isNotBlank() && it != selfId }?.let { handoffTo(it) }
        }
    }

    private fun tracks(a: JSONArray?): List<MediaMetadata> =
        if (a == null) emptyList() else (0 until a.length()).mapNotNull { sync.trackToMetadata(a.getJSONObject(it)) }

    // ---------------------------------------------------------------- commands we send

    private fun post(path: String, body: JSONObject, onDone: ((Int) -> Unit)? = null) {
        scope.launch(Dispatchers.IO) {
            val code = runCatching { sync.postAuthed(path, body) }.getOrDefault(0)
            onDone?.let { withContext(Dispatchers.Main) { it(code) } }
        }
    }

    fun send(to: String, cmd: JSONObject, onDone: ((Int) -> Unit)? = null) =
        post("/api/connect/command", JSONObject().put("from", selfId).put("to", to).put("cmd", cmd), onDone)

    fun send(to: String, type: String) = send(to, JSONObject().put("type", type))

    /** Plays [items] on the chosen remote device (used by the song lists while remote control is on). */
    fun playOn(to: String, items: List<MediaMetadata>, index: Int) {
        if (items.isEmpty()) return
        val from = (index - 3).coerceAtLeast(0)
        val slice = items.drop(from).take(300)
        val arr = JSONArray().also { a -> slice.forEach { a.put(sync.metadataToTrack(it)) } }
        send(to, JSONObject().put("type", "load").put("tracks", arr).put("index", index - from).put("position", 0).put("play", true))
    }

    /** Adds songs to the queue of a remote device (right after the current song when [next]). */
    fun enqueueOn(to: String, items: List<MediaMetadata>, next: Boolean) {
        val arr = JSONArray().also { a -> items.forEach { a.put(sync.metadataToTrack(it)) } }
        send(to, JSONObject().put("type", "enqueue").put("tracks", arr).put("next", next))
    }

    fun radioOn(to: String, song: MediaMetadata) = send(to, JSONObject().put("type", "radio").put("track", sync.metadataToTrack(song)))

    /** Sends this phone's queue to [to] and pauses here. */
    private fun handoffTo(to: String) {
        val c = pc ?: return
        val p = c.player
        if (p.mediaItemCount == 0) return
        val cur = p.currentMediaItemIndex
        val from = (cur - 3).coerceAtLeast(0)
        val arr = JSONArray()
        for (i in from until minOf(p.mediaItemCount, from + 300)) p.getMediaItemAt(i).metadata?.let { arr.put(sync.metadataToTrack(it)) }
        val wasPlaying = c.isPlaying.value
        send(to, JSONObject().put("type", "load").put("tracks", arr).put("index", cur - from).put("position", p.currentPosition / 1000.0).put("play", wasPlaying)) { code ->
            if (code in 200..299 && wasPlaying) c.pause()
        }
    }

    /** Picks where music plays. "This phone" pulls playback here; another device receives it. */
    fun transferTo(id: String) {
        val d = _devices.value
        val active = d.active?.takeIf { a -> d.list.any { it.id == a } }
        if (id == selfId) {
            _target.value = null
            suppressLatchUntil = System.currentTimeMillis() + 6000
            if (active != null && active != selfId) send(active, JSONObject().put("type", "handoff").put("to", selfId))
            return
        }
        // Remote control: this phone steers `id`. If music is playing here, move it over first.
        _target.value = id
        val localHasMusic = (pc?.player?.mediaItemCount ?: 0) > 0
        when {
            active == id -> Unit
            active != null && active != selfId -> send(active, JSONObject().put("type", "handoff").put("to", id))
            localHasMusic -> handoffTo(id)
        }
    }

    fun dropTarget() { _target.value = null }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
}
