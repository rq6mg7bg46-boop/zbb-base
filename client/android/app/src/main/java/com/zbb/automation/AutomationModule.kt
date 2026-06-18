package com.zbb.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Point
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

private const val TAG = "AutomationModule"
private const val REQUEST_MEDIA_PROJECTION = 10086

class AutomationModule(private val mReactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(mReactContext) {
    
    private val mainHandler = Handler(Looper.getMainLooper())
    
    private var permissionPromise: Promise? = null
    private var screenshotService: ScreenshotService? = null
    private val serviceBound = AtomicBoolean(false)
    
    private val serviceConnection = object : android.content.ServiceConnection {
        override fun onServiceConnected(name: android.content.ComponentName?, service: android.os.IBinder?) {
            Log.d(TAG, "ScreenshotService 已连接")
            val binder = service as? ScreenshotService.ScreenshotBinder
            screenshotService = binder?.getService()
            serviceBound.set(true)
        }
        
        override fun onServiceDisconnected(name: android.content.ComponentName?) {
            Log.d(TAG, "ScreenshotService 已断开")
            screenshotService = null
            serviceBound.set(false)
        }
    }
    
    init {
        AutomationModuleManager.registerModule(this)
        ScreenshotService.onProjectionReady = {
            Log.d(TAG, "ScreenshotService MediaProjection 已就绪")
            sendEvent("onMediaProjectionReady", null)
        }
        ScreenshotService.onProjectionError = { error ->
            Log.e(TAG, "ScreenshotService MediaProjection 错误: $error")
            sendEvent("onMediaProjectionError", error)
        }
    }
    
    override fun getName(): String = "ZBBAutomation"
    
    // ==================== 服务状态 ====================
    
    @ReactMethod
    fun isAccessibilityServiceRunning(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        promise.resolve(service != null)
    }
    
    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            mReactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // ==================== 悬浮窗权限 ====================

    @ReactMethod
    fun isOverlayPermissionGranted(promise: Promise) {
        val canDraw = Settings.canDrawOverlays(mReactContext)
        promise.resolve(canDraw)
    }

    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        try {
            // 跳系统设置页：让用户授权"显示在其他应用上方"（悬浮窗）
            //
            // 实测结论（AOSP 13 真机验证）：
            // 1) ACTION_MANAGE_APP_OVERLAY_PERMISSION 是 @SystemApi 隐藏 API，
            //    SDK 编译看不到；反射拿字符串常量可以，但 com.android.settings
            //    的目标 Activity 有 android:permission="android.permission.INTERNAL_SYSTEM_WINDOW"
            //    门控（signature 级权限，普通 app 跳过去被拒）。
            // 2) ACTION_MANAGE_OVERLAY_PERMISSION 是公开 API，Android 11+ 跳的是
            //    "所有应用列表"，package URI 被忽略，用户找不到自己 app。
            //
            // 唯一稳定的精准跳转：ACTION_APPLICATION_DETAILS_SETTINGS（公开 API）
            // → 当前 app 详情页 → "权限" → "显示在其他应用上方" → 允许。
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${mReactContext.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            mReactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            Log.d(TAG, "启动应用: $packageName")
            val service = AccessibilityServiceImpl.instance
            
            if (service == null) {
                // 如果服务未初始化，使用默认方式
                val intent = mReactContext.packageManager.getLaunchIntentForPackage(packageName)
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    mReactContext.startActivity(intent)
                    promise.resolve(true)
                } else {
                    promise.reject("ERROR", "无法找到启动 Intent")
                }
                return
            }
            
            // 通过 AccessibilityService 启动（有更高权限）
            service.launchApp(packageName) { success ->
                promise.resolve(success)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun launchAppWithMonkey(packageName: String, mainActivityClass: String, promise: Promise) {
        try {
            Log.d(TAG, "使用 monkey + AccessibilityService 启动应用: $packageName")
            
            Thread {
                try {
                    val command = "monkey -p $packageName -c android.intent.category.LAUNCHER 1"
                    val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
                    
                    val exitCode = process.waitFor()
                    Log.d(TAG, "monkey 启动完成，exitCode: $exitCode")
                    
                    // 华为设备上 exitCode 可能不准确，即使返回非0也可能实际已启动
                    // 所以直接返回 true，让调用方通过界面检查确认
                    promise.resolve(true)
                } catch (e: Exception) {
                    Log.e(TAG, "monkey 启动失败: ${e.message}")
                    promise.resolve(false)
                }
            }.start()
        } catch (e: Exception) {
            Log.e(TAG, "launchAppWithMonkey 异常: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun launchAppWithAmStart(packageName: String, mainActivityClass: String, promise: Promise) {
        try {
            Log.d(TAG, "使用 AccessibilityService 启动应用: $packageName")
            
            // 直接调用 AccessibilityService 的方法（有更高权限）
            val service = AccessibilityServiceImpl.getInstance()
            if (service != null) {
                service.launchAppWithAmStart(packageName, mainActivityClass) { success ->
                    promise.resolve(success)
                }
            } else {
                Log.e(TAG, "AccessibilityService 未初始化")
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "launchAppWithAmStart 异常: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }
    
    // ==================== 截图权限 ====================
    
    @ReactMethod
    fun requestMediaProjectionPermission(promise: Promise) {
        Log.d(TAG, "requestMediaProjectionPermission 被调用")
        permissionPromise = promise
        
        val activity = mReactContext.currentActivity
        if (activity == null) {
            promise.reject("ERROR", "当前没有 Activity")
            return
        }
        
        try {
            ScreenshotService.startService(mReactContext)
            val bindIntent = Intent(mReactContext, ScreenshotService::class.java)
            mReactContext.bindService(bindIntent, serviceConnection, Context.BIND_AUTO_CREATE)
            
            val mediaProjectionManager = mReactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val intent = mediaProjectionManager.createScreenCaptureIntent()
            
            if (mReactContext.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null) {
                Log.d(TAG, "发起 MediaProjection 权限请求")
                mReactContext.startActivityForResult(intent, REQUEST_MEDIA_PROJECTION, null)
            } else {
                promise.reject("ERROR", "没有可处理权限请求的 Activity")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    fun onMediaProjectionResult(requestCode: Int, resultCode: Int, data: Intent?) {
        Log.d(TAG, "onMediaProjectionResult: requestCode=$requestCode, resultCode=$resultCode")
        
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                Log.d(TAG, "权限授权成功")
                try {
                    val serviceIntent = Intent(mReactContext, ScreenshotService::class.java).apply {
                        action = ScreenshotService.ACTION_INIT_PROJECTION
                        putExtra("resultCode", resultCode)
                        putExtra("resultData", data)
                    }
                    mReactContext.startService(serviceIntent)
                    
                    ScreenshotService.onProjectionReady = {
                        permissionPromise?.resolve(true)
                        permissionPromise = null
                        sendEvent("onMediaProjectionReady", null)
                    }
                    ScreenshotService.onProjectionError = { error ->
                        permissionPromise?.reject("ERROR", error)
                        permissionPromise = null
                        sendEvent("onMediaProjectionError", error)
                    }
                } catch (e: Exception) {
                    permissionPromise?.reject("ERROR", e.message)
                    permissionPromise = null
                }
            } else {
                permissionPromise?.reject("ERROR", "用户拒绝或授权失败")
                permissionPromise = null
            }
        }
    }
    
    // ==================== 截图和 OCR ====================
    
    @ReactMethod
    fun isMediaProjectionEnabled(promise: Promise) {
        val ready = ScreenshotService.instance?.isProjectionReady() ?: false
        promise.resolve(ready)
    }
    
    @ReactMethod
    fun takeScreenshot(promise: Promise) {
        captureAndReturn(ReturnType.PATH, promise)
    }
    
    @ReactMethod
    fun takeScreenshotBase64(promise: Promise) {
        captureAndReturn(ReturnType.BASE64, promise)
    }
    
    @ReactMethod
    fun takeScreenshotAndSave(path: String?, promise: Promise) {
        captureAndReturn(ReturnType.PATH, promise)
    }
    
    @ReactMethod
    fun captureScreenshot(promise: Promise) {
        captureAndReturn(ReturnType.PATH, promise)
    }
    
    private enum class ReturnType { PATH, BASE64 }
    
    private fun captureAndReturn(type: ReturnType, promise: Promise) {
        Log.d(TAG, "captureAndReturn 开始")
        
        // 优先使用 ScreenshotService（MediaProjection 持久化）
        val ss = ScreenshotService.instance
        if (ss != null && ss.isProjectionReady()) {
            thread {
                try {
                    when (type) {
                        ReturnType.PATH -> {
                            val path = ss.takeScreenshot()
                            if (path != null) {
                                promise.resolve(path)
                            } else {
                                promise.reject("ERROR", "截图失败，请重试")
                            }
                        }
                        ReturnType.BASE64 -> {
                            val base64 = ss.takeScreenshotAsBase64()
                            if (base64 != null) {
                                promise.resolve(base64)
                            } else {
                                promise.reject("ERROR", "截图失败，请重试")
                            }
                        }
                    }
                } catch (e: Exception) {
                    promise.reject("ERROR", e.message)
                }
            }
            return
        }
        
        // Fallback: 使用 AccessibilityService 内置截图
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        thread {
            try {
                val bitmap = service.captureScreenshot()
                if (bitmap != null) {
                    val timestamp = System.currentTimeMillis()
                    val filename = "zbb_screenshot_${timestamp}.png"
                    
                    when (type) {
                        ReturnType.PATH -> {
                            // 1. 保存到私有目录
                            val privateFile = File(service.filesDir, filename)
                            FileOutputStream(privateFile).use { out ->
                                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                            }
                            
                            // 2. 同时保存到 Download 目录（ML Kit OCR 需要）
                            var downloadPath: String? = null
                            try {
                                val downloadDir = android.os.Environment.getExternalStoragePublicDirectory(
                                    android.os.Environment.DIRECTORY_DOWNLOADS
                                )
                                val downloadFile = File(downloadDir, filename)
                                FileOutputStream(downloadFile).use { out ->
                                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                                }
                                downloadPath = downloadFile.absolutePath
                                Log.d(TAG, "截图已保存到 Download: $downloadPath")
                            } catch (e: Exception) {
                                Log.w(TAG, "保存到 Download 失败: ${e.message}")
                            }
                            
                            // 优先返回 Download 路径
                            promise.resolve(downloadPath ?: privateFile.absolutePath)
                        }
                        ReturnType.BASE64 -> {
                            val baos = ByteArrayOutputStream()
                            bitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
                            val base64 = Base64.encodeToString(baos.toByteArray(), Base64.DEFAULT)
                            promise.resolve(base64)
                        }
                    }
                } else {
                    promise.reject("ERROR", "截图返回 null")
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    /**
     * 设置悬浮窗完成状态
     */
    @ReactMethod
    fun setFloatingComplete(promise: Promise) {
        Log.d(TAG, "setFloatingComplete 被调用")
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        try {
            service.setFloatingComplete()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun recognizeText(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        thread {
            try {
                val bitmap = service.captureScreenshot()
                if (bitmap != null) {
                    // recognizeText() 不需要 bitmap 参数，它会自己截图
                    val texts = service.recognizeText()
                    val result = Arguments.createArray()
                    texts.forEach { result.pushString(it) }
                    promise.resolve(result)
                } else {
                    promise.reject("ERROR", "截图返回 null")
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun screenContainsText(targetText: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        thread {
            try {
                val bitmap = service.captureScreenshot()
                if (bitmap != null) {
                    // 使用 recognizeTextWithPosition().find { it.text.contains(targetText) } 替代 findTextByOCR
                    val ocrResults = service.recognizeTextWithPosition()
                    val found = ocrResults.find { it.text.contains(targetText) }
                    promise.resolve(found != null)
                } else {
                    promise.reject("ERROR", "截图返回 null")
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun findTextByMLKit(targetText: String, promise: Promise) {
        findText(targetText, promise)
    }
    
    @ReactMethod
    fun findTextByMLKitWithPermission(targetText: String, packageName: String, promise: Promise) {
        findText(targetText, promise)
    }
    
    private fun findText(targetText: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        thread {
            try {
                Thread.sleep(500)
                // 使用 recognizeTextWithPosition().find { it.text.contains(targetText) } 替代 findTextByOCR
                val ocrResults = service.recognizeTextWithPosition()
                val result = ocrResults.find { it.text.contains(targetText) }
                val map = Arguments.createMap()
                if (result != null) {
                    val bounds = result.bounds
                    map.putBoolean("found", true)
                    map.putString("text", result.text)
                    map.putDouble("left", bounds.left.toDouble())
                    map.putDouble("top", bounds.top.toDouble())
                    map.putDouble("right", bounds.right.toDouble())
                    map.putDouble("bottom", bounds.bottom.toDouble())
                    map.putDouble("centerX", bounds.centerX().toDouble())
                    map.putDouble("centerY", bounds.centerY().toDouble())
                } else {
                    map.putBoolean("found", false)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    // ==================== 屏幕信息 ====================
    
    @ReactMethod
    fun getScreenSize(promise: Promise) {
        try {
            val wm = mReactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val size = Point()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealSize(size)
            val result = Arguments.createMap()
            result.putInt("width", size.x)
            result.putInt("height", size.y)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun getCurrentPackageName(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                val packageName = service.getCurrentPackageName()
                promise.resolve(packageName)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    // ==================== OCR 识别（带位置） ====================
    
    @ReactMethod
    fun recognizeTextWithPosition(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        thread {
            try {
                val results = service.recognizeTextWithPosition()
                val array = Arguments.createArray()
                
                for (result in results) {
                    val map = Arguments.createMap()
                    map.putString("text", result.text)
                    
                    val bounds = result.bounds
                    val centerX = bounds.centerX().toDouble()
                    val centerY = bounds.centerY().toDouble()
                    
                    map.putDouble("left", bounds.left.toDouble())
                    map.putDouble("top", bounds.top.toDouble())
                    map.putDouble("right", bounds.right.toDouble())
                    map.putDouble("bottom", bounds.bottom.toDouble())
                    map.putDouble("centerX", centerX)
                    map.putDouble("centerY", centerY)
                    
                    val boundsMap = Arguments.createMap()
                    boundsMap.putDouble("left", bounds.left.toDouble())
                    boundsMap.putDouble("top", bounds.top.toDouble())
                    boundsMap.putDouble("right", bounds.right.toDouble())
                    boundsMap.putDouble("bottom", bounds.bottom.toDouble())
                    map.putMap("bounds", boundsMap)
                    
                    array.pushMap(map)
                }
                
                promise.resolve(array)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    // ==================== 点击操作 ====================
    
    @ReactMethod
    fun click(x: Double, y: Double, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            Log.e(TAG, "[click] AccessibilityService 未运行，无法执行点击")
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        Log.d(TAG, "[click] 开始执行点击: ($x, $y)")
        
        mainHandler.post {
            try {
                // 首先尝试 AccessibilityService 的 click 方法
                service.click(x.toFloat(), y.toFloat())
                Log.d(TAG, "[click] AccessibilityService 点击已分发")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "[click] AccessibilityService 点击异常，尝试 shell 命令")
                // 备用方案：使用 shell 命令
                try {
                    val command = "input tap ${x.toInt()} ${y.toInt()}"
                    Log.d(TAG, "[click] 执行Shell: $command")
                    val process = Runtime.getRuntime().exec(command)
                    val result = process.waitFor()
                    Log.d(TAG, "[click] Shell命令结果: $result")
                    if (result == 0) {
                        promise.resolve(true)
                    } else {
                        promise.reject("ERROR", "Shell点击失败")
                    }
                } catch (shellError: Exception) {
                    Log.e(TAG, "[click] Shell点击也失败: ${shellError.message}")
                    promise.reject("ERROR", shellError.message)
                }
            }
        }
    }
    
    @ReactMethod
    fun longClick(x: Double, y: Double, duration: Double?, isLongPress: Boolean?, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                val durationMs = (duration ?: 2000).toLong()
                // 调用 AccessibilityServiceImpl 中已实现的 longClick 方法
                service.longClick(x.toFloat(), y.toFloat(), durationMs)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun clickWithVisualFeedback(x: Double, y: Double, showRipple: Boolean?, vibrate: Boolean?, promise: Promise) {
        click(x, y, promise)
    }
    
    @ReactMethod
    fun clickByText(text: String, isLongPress: Boolean?, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 clickByText 而不是 clickOnText
                service.clickByText(text, isLongPress ?: false)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun clickByViewId(viewId: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 clickByViewId 而不是 clickOnViewId
                service.clickByViewId(viewId)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    // ==================== 手势操作 ====================
    
    @ReactMethod
    fun swipe(startX: Double, startY: Double, endX: Double, endY: Double, duration: Double?, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                val durationMs = (duration ?: 500).toLong()
                service.swipe(startX.toFloat(), startY.toFloat(), endX.toFloat(), endY.toFloat(), durationMs) { success ->
                    promise.resolve(success)
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun swipeShell(startX: Double, startY: Double, endX: Double, endY: Double, duration: Double?, promise: Promise) {
        mainHandler.post {
            try {
                val durationMs = (duration ?: 500).toLong()
                // 使用 shell input swipe 命令，可以绕过无障碍服务在部分应用中的限制
                val command = "input swipe $startX $startY $endX $endY $durationMs"
                Log.d(TAG, "执行Shell滑动: $command")
                Runtime.getRuntime().exec(command).waitFor()
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Shell滑动失败: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun keyevent(keyCode: Double, promise: Promise) {
        mainHandler.post {
            try {
                val command = "input keyevent ${keyCode.toInt()}"
                Log.d(TAG, "执行KeyEvent: $command")
                Runtime.getRuntime().exec(command).waitFor()
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "KeyEvent失败: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun screencapShell(filePath: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        service.screencapShell(filePath) { success, error ->
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("ERROR", error ?: "截图失败")
            }
        }
    }
    
    /**
     * 使用 MediaStore API 截图
     */
    @ReactMethod
    fun screenshotViaMediaStore(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        service.screenshotViaMediaStore { success, result ->
            if (success) {
                promise.resolve(result ?: true)
            } else {
                promise.reject("ERROR", result ?: "截图失败")
            }
        }
    }
    
    /**
     * 使用帧缓冲区截图（绕过 WebView 保护）
     */
    @ReactMethod
    fun screenshotViaFramebuffer(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        service.screenshotViaFramebuffer { success, result ->
            if (success) {
                promise.resolve(result ?: true)
            } else {
                promise.reject("ERROR", result ?: "截图失败")
            }
        }
    }

    /**
     * 使用 screencap Shell 截图并保存到文件
     */
    @ReactMethod
    fun screencapShellBase64(filePath: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }

        service.screencapShellBase64(filePath) { success, result ->
            if (success) {
                promise.resolve(result ?: true)
            } else {
                promise.reject("ERROR", result ?: "截图失败")
            }
        }
    }

    @ReactMethod
    fun pullToRefresh(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 swipe 实现下拉刷新效果
                service.swipe(540f, 200f, 540f, 800f, 500)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun findNodeCenterByText(text: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        mainHandler.post {
            try {
                val result = service.findNodeCenterByText(text)
                if (result != null) {
                    promise.resolve(nodeCenterToMap(result))
                } else {
                    promise.reject("NOT_FOUND", "未找到节点: $text")
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    private fun nodeCenterToMap(map: Map<String, Any>): WritableMap {
        val wm = Arguments.createMap()
        wm.putInt("centerX", (map["centerX"] as Number).toInt())
        wm.putInt("centerY", (map["centerY"] as Number).toInt())
        wm.putString("text", map["text"] as String? ?: "")
        return wm
    }

    @ReactMethod
    fun pressHomeKey(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        mainHandler.post {
            try {
                service.pressHomeKey()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun scrollUp(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // Android AccessibilityService 没有 SCROLL_UP，使用滑动手势替代
                service.swipe(540f, 800f, 540f, 200f, 300)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun scrollDown(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // Android AccessibilityService 没有 SCROLL_DOWN，使用滑动手势替代
                service.swipe(540f, 200f, 540f, 800f, 300)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    // ==================== 文本操作 ====================
    
    @ReactMethod
    fun inputText(text: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 inputText(callback) 而不是 inputText(text)
                service.inputText(text) { success ->
                    promise.resolve(success)
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun clearInput(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 clearInput(callback) 而不是 clearInput()
                service.clearInput { success ->
                    promise.resolve(success)
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun pasteText(text: String, promise: Promise) {
        try {
            val clipboard = mReactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = android.content.ClipData.newPlainText("text", text)
            clipboard.setPrimaryClip(clip)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun setClipboardText(text: String, promise: Promise) {
        pasteText(text, promise)
    }
    
    @ReactMethod
    fun getClipboardText(promise: Promise) {
        try {
            val clipboard = mReactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            
            // 重试机制：最多尝试3次，每次间隔500ms
            for (attempt in 1..3) {
                val clip = clipboard.primaryClip
                if (clip != null && clip.itemCount > 0) {
                    val text = clip.getItemAt(0).text?.toString() ?: ""
                    if (text.isNotEmpty()) {
                        Log.d(TAG, "getClipboardText 第${attempt}次获取成功: ${text.take(50)}...")
                        promise.resolve(text)
                        return
                    }
                }
                if (attempt < 3) {
                    Log.d(TAG, "getClipboardText 第${attempt}次获取为空，等待500ms后重试...")
                    Thread.sleep(500)
                }
            }
            
            Log.d(TAG, "getClipboardText 3次尝试均未获取到内容")
            promise.resolve("")
        } catch (e: Exception) {
            Log.e(TAG, "getClipboardText 异常: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }
    
    // ==================== 导航操作 ====================
    
    @ReactMethod
    fun pressBack(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun pressHome(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun pressRecentApps(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    // ==================== 元素查找 ====================
    
    @ReactMethod
    fun findElementByText(text: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 findNodeByText 而不是 findElementByText
                val info = service.findNodeByText(text, clickable = false)
                
                if (info != null) {
                    val result = elementInfoToMap(info)
                    result.putBoolean("found", true)
                    promise.resolve(result)
                } else {
                    // 返回包含调试信息的对象
                    val debugInfo = Arguments.createMap()
                    debugInfo.putBoolean("found", false)
                    debugInfo.putString("searchText", text)
                    debugInfo.putString("reason", "findNodeByText 返回 null，节点可能在 UI 刷新后消失")
                    debugInfo.putString("hint", "尝试使用 clickByText 或直接计算坐标点击")
                    promise.resolve(debugInfo)
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun findElementByViewId(viewId: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 findNodeByViewId 而不是 findElementByViewId
                val info = service.findNodeByViewId(viewId)
                if (info != null) {
                    promise.resolve(elementInfoToMap(info))
                } else {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun getAllTextNodes(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }

        mainHandler.post {
            try {
                val nodes = service.getAllTextNodes()
                val result = Arguments.createArray()

                nodes.forEach { node ->
                    val map = Arguments.createMap()
                    map.putString("text", node["text"] as? String ?: "")
                    map.putDouble("centerX", (node["centerX"] as? Double) ?: 0.0)
                    map.putDouble("centerY", (node["centerY"] as? Double) ?: 0.0)
                    map.putString("type", node["type"] as? String ?: "text")
                    result.pushMap(map)
                }

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun waitForElement(text: String?, viewId: String?, timeout: Double?, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        val timeoutMs = (timeout ?: 5000).toLong()
        val startTime = System.currentTimeMillis()
        
        thread {
            while (System.currentTimeMillis() - startTime < timeoutMs) {
                // 使用 findNodeByText 和 findNodeByViewId 而不是 findElementByText 和 findElementByViewId
                val info = when {
                    text != null -> service.findNodeByText(text, clickable = false)
                    viewId != null -> service.findNodeByViewId(viewId)
                    else -> null
                }
                
                if (info != null) {
                    promise.resolve(elementInfoToMap(info))
                    return@thread
                }
                Thread.sleep(200)
            }
            promise.resolve(null)
        }
    }
    
    @ReactMethod
    fun getClickableElements(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 findNodesByText 查找所有文本匹配的元素（包括可点击和不可点击的）
                val elements = service.findNodesByText("")
                val clickableElements = elements.filter { it.isClickable }
                val result = Arguments.createArray()
                clickableElements.forEach { result.pushMap(elementInfoToMap(it)) }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun dumpWindowTree(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 findNodesByText 获取所有文本节点来构建窗口树
                val nodes = service.findNodesByText("")
                val result = Arguments.createArray()
                nodes.forEach { result.pushMap(elementInfoToMap(it)) }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun dumpWindowTreeString(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                val treeString = service.dumpWindowTreeToString("JS-DEBUG")
                if (treeString != null) {
                    promise.resolve(treeString)
                } else {
                    promise.resolve("")
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun findElementsByText(text: String, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                // 使用 findNodesByText 而不是 findElementsByText
                val elements = service.findNodesByText(text)
                val result = Arguments.createArray()
                elements.forEach { result.pushMap(elementInfoToMap(it)) }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    // ==================== 工具方法 ====================
    
    @ReactMethod
    fun delay(ms: Double, promise: Promise) {
        thread {
            Thread.sleep(ms.toLong())
            promise.resolve(true)
        }
    }
    
    @ReactMethod
    fun showToast(message: String, promise: Promise) {
        try {
            android.widget.Toast.makeText(mReactContext, message, android.widget.Toast.LENGTH_SHORT).show()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun addListener(eventName: String) {}
    
    @ReactMethod
    fun removeListeners(count: Int) {}
    
    // ==================== 辅助方法 ====================
    
    private fun sendEvent(eventName: String, params: Any?) {
        if (mReactContext.hasActiveCatalystInstance()) {
            mReactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(eventName, params)
        }
    }

    /**
     * 发送事件给 JS 层（公开方法，供其他组件调用）
     */
    fun sendEventToJS(eventName: String, params: Any?) {
        sendEvent(eventName, params)
    }
    
    private fun elementInfoToMap(info: AccessibilityNodeInfo): WritableMap {
        val rect = android.graphics.Rect()
        info.getBoundsInScreen(rect)
        
        val map = Arguments.createMap()
        map.putString("text", info.text?.toString() ?: "")
        map.putString("viewId", info.viewIdResourceName ?: "")
        map.putInt("left", rect.left)
        map.putInt("top", rect.top)
        map.putInt("right", rect.right)
        map.putInt("bottom", rect.bottom)
        map.putInt("centerX", rect.centerX())
        map.putInt("centerY", rect.centerY())
        map.putBoolean("clickable", info.isClickable)
        map.putBoolean("scrollable", info.isScrollable)
        return map
    }
    
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        AutomationModuleManager.unregisterModule()
        
        if (serviceBound.get()) {
            try {
                mReactContext.unbindService(serviceConnection)
                serviceBound.set(false)
            } catch (e: Exception) {
                Log.w(TAG, "解绑 ScreenshotService 失败: ${e.message}")
            }
        }
        
        ScreenshotService.onProjectionReady = null
        ScreenshotService.onProjectionError = null
    }
    
    // ==================== 悬浮窗控制 ====================
    
    @ReactMethod
    fun showFloatingWindow(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                service.showFloatingWindow()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun hideFloatingWindow(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                service.hideFloatingWindow()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun updateFloatingStep(stepName: String, stepIndex: Int, totalSteps: Int, promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                service.updateFloatingStep(stepName, stepIndex, totalSteps)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    /**
     * 开始脉冲震动（不依赖 AccessibilityService，从 ReactContext 拿 Vibrator）
     */
    @ReactMethod
    fun startPulseVibration(promise: Promise) {
        mainHandler.post {
            try {
                val vibrator = getVibrator()
                if (vibrator == null) {
                    Log.e(TAG, "startPulseVibration: 无法获取 Vibrator")
                    promise.reject("ERROR", "无法获取 Vibrator")
                    return@post
                }
                // 脉冲模式：停顿300 → 震300 → 停200 → 震300 → 停200 → 震300，repeat=0 表示从索引 0 重复
                val pattern = longArrayOf(0, 300, 200, 300, 200, 300)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(pattern, 0)
                }
                Log.d(TAG, "startPulseVibration: 已启动")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "startPulseVibration 失败: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }

    /**
     * 停止震动（不依赖 AccessibilityService）
     */
    @ReactMethod
    fun stopVibration(promise: Promise) {
        mainHandler.post {
            try {
                val vibrator = getVibrator()
                if (vibrator == null) {
                    Log.e(TAG, "stopVibration: 无法获取 Vibrator")
                    promise.reject("ERROR", "无法获取 Vibrator")
                    return@post
                }
                vibrator.cancel()
                Log.d(TAG, "stopVibration: 已停止")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "stopVibration 失败: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }

    /**
     * 从 ReactContext 拿 app-level Vibrator
     * 注意：用老 API VIBRATOR_SERVICE（不要用 VIBRATOR_MANAGER_SERVICE 的 defaultVibrator，
     * 那是系统级 vibrator，EMUI/HarmonyOS 上 cancel() 不一定生效，且进程死时震动不自动停。
     * 老 API 拿到的 Vibrator 是 app-level，进程死时震动自动停，cancel() 也能正常停。）
     */
    private fun getVibrator(): Vibrator? {
        return try {
            @Suppress("DEPRECATION")
            mReactContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        } catch (e: Exception) {
            Log.e(TAG, "getVibrator 失败: ${e.message}")
            null
        }
    }

    // ==================== 进程管理 ====================

    /**
     * 后台强制停止指定应用进程
     * @param packageName 要停止的应用包名
     */
    @ReactMethod
    fun forceStopPackage(packageName: String, promise: Promise) {
        try {
            Log.d(TAG, "forceStopPackage: $packageName")
            Thread {
                try {
                    val command = "am force-stop $packageName"
                    val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
                    val exitCode = process.waitFor()
                    Log.d(TAG, "force-stop exitCode: $exitCode")
                    promise.resolve(exitCode == 0)
                } catch (e: Exception) {
                    Log.e(TAG, "force-stop error: ${e.message}")
                    promise.resolve(false)
                }
            }.start()
        } catch (e: Exception) {
            Log.e(TAG, "forceStopPackage exception: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    // ==================== 截图标注功能 ====================

    /**
     * 截图并标出所有文字的坐标
     * 功能：截图 -> OCR识别 -> 在图片上绘制边框和坐标标注 -> 保存
     */
    @ReactMethod
    fun screenshotAndMark(promise: Promise) {
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }

        thread {
            try {
                Log.d(TAG, "[screenshotAndMark] 开始截图标注...")

                // 1. 截图
                val bitmap = service.captureScreenshot()
                if (bitmap == null) {
                    promise.reject("ERROR", "截图失败，返回 null")
                    return@thread
                }

                // 2. OCR 识别文字位置
                val ocrResults = service.recognizeTextWithPosition()
                Log.d(TAG, "[screenshotAndMark] 识别到 ${ocrResults.size} 个文字元素")

                // 3. 创建可编辑的 Bitmap 副本
                val mutableBitmap = bitmap.copy(Bitmap.Config.ARGB_8888, true)
                val canvas = android.graphics.Canvas(mutableBitmap)

                // 4. 绘制设置
                val width = mutableBitmap.width.toFloat()
                val height = mutableBitmap.height.toFloat()

                // 根据图片尺寸调整字体大小
                val fontSize = minOf(width, height) / 30f

                // 5. 绘制每个文字的边框和坐标
                ocrResults.forEachIndexed { index, result ->
                    val bounds = result.bounds
                    val text = result.text

                    if (text.isNullOrBlank()) return@forEachIndexed

                    // 绘制红色边框
                    val paint = android.graphics.Paint().apply {
                        color = android.graphics.Color.RED
                        style = android.graphics.Paint.Style.STROKE
                        strokeWidth = 4f
                        isAntiAlias = true
                    }
                    canvas.drawRect(
                        bounds.left.toFloat(),
                        bounds.top.toFloat(),
                        bounds.right.toFloat(),
                        bounds.bottom.toFloat(),
                        paint
                    )

                    // 绘制中心点（蓝色圆点）
                    val centerX = bounds.centerX().toFloat()
                    val centerY = bounds.centerY().toFloat()
                    val dotPaint = android.graphics.Paint().apply {
                        color = android.graphics.Color.BLUE
                        style = android.graphics.Paint.Style.FILL
                        isAntiAlias = true
                    }
                    canvas.drawCircle(centerX, centerY, 8f, dotPaint)

                    // 绘制序号和坐标文字背景（白色半透明背景）
                    val labelBgPaint = android.graphics.Paint().apply {
                        color = android.graphics.Color.argb(200, 255, 255, 255)
                        style = android.graphics.Paint.Style.FILL
                        isAntiAlias = true
                    }

                    // 绘制文字背景矩形
                    val labelText = "${index + 1}. ($centerX, $centerY)"
                    val textPaint = android.graphics.Paint().apply {
                        color = android.graphics.Color.RED
                        textSize = fontSize
                        isFakeBoldText = true
                        isAntiAlias = true
                    }
                    val textWidth = textPaint.measureText(labelText)
                    val textHeight = textPaint.descent() - textPaint.ascent()

                    // 标签位置：文字框上方
                    val labelX = bounds.left.toFloat()
                    val labelY = bounds.top.toFloat() - 5f

                    canvas.drawRect(
                        labelX - 2,
                        labelY - textHeight - 2,
                        labelX + textWidth + 4,
                        labelY + 4,
                        labelBgPaint
                    )

                    // 绘制序号和坐标文字
                    canvas.drawText(labelText, labelX, labelY - 2, textPaint)
                }

                // 6. 保存标注后的图片
                val timestamp = System.currentTimeMillis()
                val filename = "zbb_marked_${timestamp}.png"

                // 保存到私有目录
                val privateFile = File(service.filesDir, filename)
                FileOutputStream(privateFile).use { out ->
                    mutableBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                }

                // 同时保存到 Download 目录
                var downloadPath: String? = null
                try {
                    val downloadDir = android.os.Environment.getExternalStoragePublicDirectory(
                        android.os.Environment.DIRECTORY_DOWNLOADS
                    )
                    val downloadFile = File(downloadDir, filename)
                    FileOutputStream(downloadFile).use { out ->
                        mutableBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    }
                    downloadPath = downloadFile.absolutePath
                    Log.d(TAG, "[screenshotAndMark] 标注截图已保存到 Download: $downloadPath")
                } catch (e: Exception) {
                    Log.w(TAG, "[screenshotAndMark] 保存到 Download 失败: ${e.message}")
                }

                // 7. 返回结果
                val result = Arguments.createMap().apply {
                    putString("path", downloadPath ?: privateFile.absolutePath)
                    putInt("textCount", ocrResults.size)
                    putArray("texts", Arguments.createArray().apply {
                        ocrResults.forEachIndexed { index, result ->
                            val map = Arguments.createMap().apply {
                                putInt("index", index + 1)
                                putString("text", result.text ?: "")
                                putDouble("centerX", result.bounds.centerX().toDouble())
                                putDouble("centerY", result.bounds.centerY().toDouble())
                                putDouble("left", result.bounds.left.toDouble())
                                putDouble("top", result.bounds.top.toDouble())
                                putDouble("right", result.bounds.right.toDouble())
                                putDouble("bottom", result.bounds.bottom.toDouble())
                            }
                            pushMap(map)
                        }
                    })
                }

                Log.d(TAG, "[screenshotAndMark] 完成，共标注 ${ocrResults.size} 个文字元素")
                promise.resolve(result)

            } catch (e: Exception) {
                Log.e(TAG, "[screenshotAndMark] 失败: ${e.message}")
                promise.reject("ERROR", e.message)
            }
        }
    }

    // ==================== Shell 命令执行 ====================

    @ReactMethod
    fun execShell(command: String, promise: Promise) {
        try {
            Log.d(TAG, "[execShell] 执行: $command");
            val process = Runtime.getRuntime().exec(command);
            val reader = java.io.BufferedReader(java.io.InputStreamReader(process.inputStream));
            val errorReader = java.io.BufferedReader(java.io.InputStreamReader(process.errorStream));
            val output = StringBuilder();
            var line: String?;
            while (reader.readLine().also { line = it } != null) {
                output.append(line).append("\n");
            }
            val errorOutput = StringBuilder();
            while (errorReader.readLine().also { line = it } != null) {
                errorOutput.append(line).append("\n");
            }
            process.waitFor();
            val result = output.toString();
            Log.d(TAG, "[execShell] 结果长度: ${result.length}");
            promise.resolve(result);
        } catch (e: Exception) {
            Log.e(TAG, "[execShell] 失败: ${e.message}");
            promise.reject("ERROR", e.message);
        }
    }

    @ReactMethod
    fun showScreenshotButton(promise: Promise) {
        try {
            val service = AccessibilityServiceImpl.getInstance();
            if (service != null) {
                service.showScreenshotButton();
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "AccessibilityService 未运行");
            }
        } catch (e: Exception) {
            Log.e(TAG, "[showScreenshotButton] 失败: ${e.message}");
            promise.reject("ERROR", e.message);
        }
    }

    @ReactMethod
    fun hideScreenshotButton(promise: Promise) {
        try {
            val service = AccessibilityServiceImpl.getInstance();
            if (service != null) {
                service.hideScreenshotButton();
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "AccessibilityService 未运行");
            }
        } catch (e: Exception) {
            Log.e(TAG, "[hideScreenshotButton] 失败: ${e.message}");
            promise.reject("ERROR", e.message);
        }
    }

    // ==================== OCR 截图 ====================

    @ReactMethod
    fun ocrLatestScreenshot(promise: Promise) {
        Log.d(TAG, "[ocrLatestScreenshot] 开始查询相册最新截图...")
        Thread {
            try {
                val cr = mReactContext.contentResolver
                val projection = arrayOf(
                    android.provider.MediaStore.Images.Media._ID,
                    android.provider.MediaStore.Images.Media.DISPLAY_NAME,
                    android.provider.MediaStore.Images.Media.DATE_ADDED
                )
                val sortOrder = "${android.provider.MediaStore.Images.Media.DATE_ADDED} DESC"
                val selection = "${android.provider.MediaStore.Images.Media.DISPLAY_NAME} LIKE '%Screenshot%' OR ${android.provider.MediaStore.Images.Media.DISPLAY_NAME} LIKE '%截图%'"

                val cursor = cr.query(
                    android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection,
                    selection,
                    null,
                    sortOrder
                )

                if (cursor == null || !cursor.moveToFirst()) {
                    Log.e(TAG, "[ocrLatestScreenshot] 未找到截图")
                    promise.reject("ERROR", "未找到截图")
                    return@Thread
                }

                val idCol = cursor.getColumnIndexOrThrow(android.provider.MediaStore.Images.Media._ID)
                val id = cursor.getLong(idCol)
                cursor.close()

                val uri = android.content.ContentUris.withAppendedId(
                    android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    id
                )
                Log.d(TAG, "[ocrLatestScreenshot] 找到截图 URI: $uri")

                val inputStream = cr.openInputStream(uri)
                val bitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
                inputStream?.close()

                if (bitmap == null) {
                    Log.e(TAG, "[ocrLatestScreenshot] 无法解码图片")
                    promise.reject("ERROR", "无法解码图片")
                    return@Thread
                }

                Log.d(TAG, "[ocrLatestScreenshot] 图片尺寸: ${bitmap.width}x${bitmap.height}")

                // 调用 OcrHelper 进行识别
                OcrHelper.recognize(bitmap) { results, error ->
                    if (error != null) {
                        Log.e(TAG, "[ocrLatestScreenshot] OCR 失败: $error")
                        promise.reject("ERROR", error)
                        return@recognize
                    }

                    val textBlocks = results.joinToString("\n") { it.text }
                    Log.d(TAG, "[ocrLatestScreenshot] 识别到 ${results.size} 个文本块")
                    Log.d(TAG, "[ocrLatestScreenshot] 内容:\n$textBlocks")

                    // 返回 JSON 格式结果
                    val jsonResult = com.facebook.react.bridge.Arguments.createArray()
                    results.forEach { r ->
                        val map = com.facebook.react.bridge.Arguments.createMap()
                        map.putString("text", r.text)
                        map.putDouble("confidence", r.confidence.toDouble())
                        map.putInt("left", r.boundingBox.left)
                        map.putInt("top", r.boundingBox.top)
                        map.putInt("right", r.boundingBox.right)
                        map.putInt("bottom", r.boundingBox.bottom)
                        jsonResult.pushMap(map)
                    }

                    val resultMap = com.facebook.react.bridge.Arguments.createMap()
                    resultMap.putArray("blocks", jsonResult)
                    resultMap.putString("fullText", textBlocks)
                    promise.resolve(resultMap)
                }

            } catch (e: Exception) {
                Log.e(TAG, "[ocrLatestScreenshot] 异常: ${e.message}", e)
                promise.reject("ERROR", e.message)
            }
        }.start()
    }
}
