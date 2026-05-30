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
import android.os.Handler
import android.os.Looper
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
    
    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            val intent = mReactContext.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                mReactContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "无法找到启动 Intent")
            }
        } catch (e: Exception) {
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
        val service = AccessibilityServiceImpl.instance
        if (service == null) {
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        thread {
            try {
                val bitmap = service.captureScreenshot()
                if (bitmap != null) {
                    when (type) {
                        ReturnType.PATH -> {
                            // 调用 saveScreenshotToFile 需要主线程，这里使用内联实现
                            val timestamp = System.currentTimeMillis()
                            val filename = "zbb_screenshot_${timestamp}.png"
                            val privateFile = File(service.filesDir, filename)
                            FileOutputStream(privateFile).use { out ->
                                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                            }
                            promise.resolve(privateFile.absolutePath)
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
                    map.putDouble("left", result.left.toDouble())
                    map.putDouble("top", result.top.toDouble())
                    map.putDouble("right", result.right.toDouble())
                    map.putDouble("bottom", result.bottom.toDouble())
                    map.putDouble("centerX", result.centerX.toDouble())
                    map.putDouble("centerY", result.centerY.toDouble())
                    
                    val bounds = Arguments.createMap()
                    bounds.putDouble("left", result.left.toDouble())
                    bounds.putDouble("top", result.top.toDouble())
                    bounds.putDouble("right", result.right.toDouble())
                    bounds.putDouble("bottom", result.bottom.toDouble())
                    map.putMap("bounds", bounds)
                    
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
            promise.reject("ERROR", "AccessibilityService 未运行")
            return
        }
        
        mainHandler.post {
            try {
                service.click(x.toFloat(), y.toFloat())
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
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
                // 使用 clickByText 或直接用 click 实现长按效果
                val durationMs = (duration ?: 1000).toLong()
                // AccessibilityService 没有 performLongClick，使用延迟点击模拟
                service.click(x.toFloat(), y.toFloat())
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
                // 使用 swipe 而不是 performSwipe，注意参数类型是 Float
                service.swipe(startX.toFloat(), startY.toFloat(), endX.toFloat(), endY.toFloat(), durationMs)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
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
            val text = clipboard.primaryClip?.getItemAt(0)?.text?.toString() ?: ""
            promise.resolve(text)
        } catch (e: Exception) {
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
}
