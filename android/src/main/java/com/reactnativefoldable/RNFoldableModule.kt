package com.reactnativefoldable

import android.app.Activity
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.abs

/**
 * Combines two Android signals:
 *  - Sensor.TYPE_HINGE_ANGLE (API 30+): exact angle, works on the cover screen too.
 *  - Jetpack WindowManager FoldingFeature: posture + hinge bounds, only while the window spans the fold.
 */
class RNFoldableModule(private val reactContext: ReactApplicationContext) :
  NativeFoldableSpec(reactContext), SensorEventListener, LifecycleEventListener {

  companion object {
    const val NAME = "RNFoldable"
    private const val EVENT_NAME = "foldableChanged"
    private const val ANGLE_EPSILON = 1.0
  }

  private val sensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val hingeSensor: Sensor? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE) else null

  private var tracker: WindowInfoTrackerCallbackAdapter? = null
  private var trackedActivity: Activity? = null
  private val layoutConsumer = Consumer<WindowLayoutInfo> { onLayoutChanged(it) }

  @Volatile private var angle: Double? = null
  @Volatile private var feature: FoldingFeature? = null
  @Volatile private var hasSeenFoldingFeature = false
  private var lastEmitted: String? = null

  init {
    reactContext.addLifecycleEventListener(this)
    // The module is often created after the activity has already resumed.
    if (reactContext.currentActivity != null) onHostResume()
  }

  override fun getName() = NAME

  override fun getFoldableInfo(promise: Promise) {
    promise.resolve(snapshot())
  }

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  // region Lifecycle

  override fun onHostResume() {
    hingeSensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    startWindowTracking(reactContext.currentActivity)
  }

  override fun onHostPause() {
    sensorManager.unregisterListener(this)
  }

  override fun onHostDestroy() {
    sensorManager.unregisterListener(this)
    stopWindowTracking()
  }

  override fun invalidate() {
    reactContext.removeLifecycleEventListener(this)
    onHostDestroy()
    super.invalidate()
  }

  // endregion

  // region Window tracking

  private fun startWindowTracking(activity: Activity?) {
    if (activity == null || activity === trackedActivity) return
    stopWindowTracking()
    try {
      val adapter = WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(activity))
      adapter.addWindowLayoutInfoListener(activity, ContextCompat.getMainExecutor(activity), layoutConsumer)
      tracker = adapter
      trackedActivity = activity
    } catch (_: Throwable) {
      // WindowManager extensions unavailable on this device/vendor build.
    }
  }

  private fun stopWindowTracking() {
    tracker?.removeWindowLayoutInfoListener(layoutConsumer)
    tracker = null
    trackedActivity = null
  }

  private fun onLayoutChanged(info: WindowLayoutInfo) {
    feature = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
    if (feature != null) hasSeenFoldingFeature = true
    emitIfChanged()
  }

  // endregion

  // region Hinge sensor

  override fun onSensorChanged(event: SensorEvent?) {
    val value = event?.values?.firstOrNull()?.toDouble() ?: return
    val previous = angle
    if (previous != null && abs(previous - value) < ANGLE_EPSILON) return
    angle = value.coerceIn(0.0, 180.0)
    emitIfChanged()
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  // endregion

  private fun snapshot(): WritableMap = Arguments.createMap().apply {
    val currentFeature = feature
    val currentAngle = angle
    // A missing FoldingFeature (e.g. on the cover screen) does not mean the device isn't foldable,
    // so once one has been seen we keep reporting support.
    putBoolean("isSupported", hingeSensor != null || hasSeenFoldingFeature)
    putString(
      "status",
      when (currentFeature?.state) {
        FoldingFeature.State.FLAT -> "fullyOpen"
        FoldingFeature.State.HALF_OPENED -> "partiallyOpen"
        else -> "unknown"
      }
    )
    if (currentAngle == null) putNull("angle") else putDouble("angle", currentAngle)
    if (currentFeature == null) putNull("hinge") else putMap("hinge", hingeMap(currentFeature))
  }

  private fun hingeMap(feature: FoldingFeature): WritableMap = Arguments.createMap().apply {
    val density = reactContext.resources.displayMetrics.density
    val bounds = feature.bounds
    putDouble("x", (bounds.left / density).toDouble())
    putDouble("y", (bounds.top / density).toDouble())
    putDouble("width", (bounds.width() / density).toDouble())
    putDouble("height", (bounds.height() / density).toDouble())
    putString("orientation", if (feature.orientation == FoldingFeature.Orientation.HORIZONTAL) "horizontal" else "vertical")
    putBoolean("isSeparating", feature.isSeparating)
    putBoolean("isOccluding", feature.occlusionType == FoldingFeature.OcclusionType.FULL)
  }

  @Synchronized
  private fun emitIfChanged() {
    if (!reactContext.hasActiveReactInstance()) return
    val payload = snapshot()
    val key = payload.toHashMap().toString()
    if (key == lastEmitted) return
    lastEmitted = key
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }
}
