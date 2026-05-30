package com.zbb.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.annotation.SuppressLint
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.PixelFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * ZBB 无障碍服务实现类
 * 版本: v1.5 (简化版，移除 MediaProjection 截图)
 * 
 * 功能：
 * 1. 查找界面元素（按文本、按ID）
 * 2. 模拟点击（单击、长按）
 * 3. 模拟滑动
 * 4. 输入文本
 * 5. 监听通知变化
 * 6. 获取剪贴板内容
 */
class AccessibilityServiceImpl : AccessibilityService() {

    companion object {
        private const val TAG = "AccessibilityServiceImpl"
        
        // 单例实例
        @Volatile
        private var instance: AccessibilityServiceImpl? = null
        
        // 回调接口
        var onNotificationReceived: ((String, String) -> Unit)? = null
        var onScreenshotTaken: ((Bitmap?) -> Unit)? = null
        var onScreenshotSaved: ((String) -> Unit)? = null
        
        fun getInstance(): AccessibilityServiceImpl? = instance
        
        fun isServiceRunning(): Boolean {
            return instance != null
        }
        
        /**
         * 使用 AccessibilityManager 检查服务是否启用
         */
        fun isAccessibilityServiceEnabled(context: android.content.Context): Boolean {
            try {
                val accessibilityManager = context.getSystemService(android.content.Context.ACCESSIBILITY_SERVICE) 
                    as android.view.accessibility.AccessibilityManager
                
                val isEnabledGlobally = accessibilityManager.isEnabled
                if (!isEnabledGlobally) {
                    return false
                }
                
                val enabledServices = accessibilityManager.getEnabledAccessibilityServiceList(
                    AccessibilityServiceInfo.FEEDBACK_ALL_MASK
                )
                
                val packageName = context.packageName
                
                for (service in enabledServices) {
                    val serviceId = service.id ?: ""
                    val resolveInfoName = service.resolveInfo?.serviceInfo?.name ?: ""
                    
                    if (serviceId.contains(packageName) || resolveInfoName.contains(packageName)) {
                        Log.d(TAG, "找到已启用的 ZBB 无障碍服务: $serviceId")
                        return true
                    }
                }
                
                Log.d(TAG, "未找到 ZBB 无障碍服务，已启用的服务数量: ${enabledServices.size}")
                return instance != null
            } catch (e: Exception) {
                Log.e(TAG, "检查服务状态失败: ${e.message}")
                return instance != null
            }
        }
    }
    
    // 协程作用域
    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    // 主线程 Handler
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // MediaProjection 相关
    private var mediaProjection: MediaProjection? = null
    
    // 悬浮窗管理器
    private var floatingWindowManager: FloatingWindowManager? = null
    
    // 最近的通知内容
    private var lastNotificationText: String = ""
    
    // 是否正在运行自动化流程
    private var isAutomationRunning = false
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "无障碍服务已创建")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        instance = null
        mediaProjection?.stop()
        mediaProjection = null
        floatingWindowManager?.destroy()
        floatingWindowManager = null
        serviceScope.cancel()
        Log.d(TAG, "无障碍服务已销毁")
    }
    
    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "无障碍服务已连接")
        
        // 初始化悬浮窗管理器
        initFloatingWindow()
    }
    
    /**
     * 初始化悬浮窗
     */
    private fun initFloatingWindow() {
        floatingWindowManager = FloatingWindowManager(this)
        floatingWindowManager?.onStopClicked = {
            Log.d(TAG, "用户点击停止按钮")
            stopAutomation()
        }
        Log.d(TAG, "悬浮窗管理器已初始化")
    }
    
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        
        Log.d(TAG, "收到无障碍事件类型: ${event.eventType}")
        
        when (event.eventType) {
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> {
                val packageName = event.packageName?.toString() ?: return
                val text = event.text?.joinToString("\n") ?: ""
                
                if (text.isNotEmpty()) {
                    lastNotificationText = text
                    Log.d(TAG, "收到通知 [$packageName]: $text")
                    onNotificationReceived?.invoke(packageName, text)
                }
            }
            
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val className = event.className?.toString() ?: ""
                Log.d(TAG, "窗口变化: $className")
            }
            
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                Log.d(TAG, "窗口内容变化")
            }
            
            else -> {
                // 其他事件类型
            }
        }
    }
    
    override fun onInterrupt() {
        Log.w(TAG, "无障碍服务被中断")
    }
    
    fun setMediaProjection(projection: MediaProjection) {
        this.mediaProjection = projection
        Log.d(TAG, "MediaProjection 已设置")
    }
    
    // ==================== 悬浮窗控制 ====================
    
    /**
     * 显示悬浮窗
     */
    fun showFloatingWindow() {
        mainHandler.post {
            floatingWindowManager?.show()
            isAutomationRunning = true
            Log.d(TAG, "悬浮窗已显示")
        }
    }
    
    /**
     * 隐藏悬浮窗
     */
    fun hideFloatingWindow() {
        mainHandler.post {
            floatingWindowManager?.hide()
            isAutomationRunning = false
            Log.d(TAG, "悬浮窗已隐藏")
        }
    }
    
    /**
     * 更新悬浮窗步骤
     */
    fun updateFloatingStep(stepName: String, stepIndex: Int, totalSteps: Int = 14) {
        mainHandler.post {
            floatingWindowManager?.updateStep(stepName, stepIndex, totalSteps)
        }
    }
    
    /**
     * 更新悬浮窗 APP 信息
     */
    fun updateFloatingAppInfo(appName: String) {
        mainHandler.post {
            floatingWindowManager?.updateAppInfo(appName)
        }
    }
    
    /**
     * 设置空闲状态
     */
    fun setFloatingIdle() {
        mainHandler.post {
            floatingWindowManager?.setIdle()
        }
    }
    
    /**
     * 设置完成状态
     */
    fun setFloatingComplete() {
        mainHandler.post {
            floatingWindowManager?.setComplete()
            isAutomationRunning = false
        }
    }
    
    /**
     * 停止自动化流程
     */
    private fun stopAutomation() {
        isAutomationRunning = false
        // 通知 React Native 停止流程
        mainHandler.post {
            Toast.makeText(this, "ZBB 自动化流程已停止", Toast.LENGTH_SHORT).show()
        }
        // 可以通过广播或其他方式通知前端
    }
    
    /**
     * 检查是否正在运行
     */
    fun isRunning(): Boolean = isAutomationRunning
    
    // ==================== 截图功能（备用方案） ====================
    
    /**
     * 截取屏幕截图（使用 AccessibilityNodeInfo 方式）
     * 注意：此方式只能获取当前窗口的视图层级信息，不能获取实际屏幕像素
     */
    @SuppressLint("MissingPermission")
    fun takeScreenshot(callback: (Bitmap?) -> Unit) {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "takeScreenshot 尝试在非主线程调用，已在主线程重新执行")
            mainHandler.post {
                takeScreenshotInternal(callback)
            }
            return
        }
        takeScreenshotInternal(callback)
    }
    
    @SuppressLint("MissingPermission")
    private fun takeScreenshotInternal(callback: (Bitmap?) -> Unit) {
        try {
            val rootNode = rootInActiveWindow
            if (rootNode != null) {
                val bitmap = captureScreenFromNode(rootNode)
                rootNode.recycle()
                callback(bitmap)
            } else {
                Log.w(TAG, "无法获取当前窗口")
                callback(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "截图失败: ${e.message}")
            callback(null)
        }
    }
    
    private fun captureScreenFromNode(node: AccessibilityNodeInfo): Bitmap? {
        try {
            val location = android.graphics.Rect()
            node.getBoundsInScreen(location)
            
            val width = location.width()
            val height = location.height()
            
            if (width <= 0 || height <= 0) {
                Log.e(TAG, "无效的节点尺寸: $width x $height")
                return null
            }
            
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.drawColor(0xFFFFFFFF.toInt())
            
            Log.d(TAG, "创建空白截图: ${width}x${height}")
            return bitmap
            
        } catch (e: Exception) {
            Log.e(TAG, "节点截图失败: ${e.message}")
            return null
        }
    }
    
    /**
     * 截图并保存到文件
     */
    @SuppressLint("MissingPermission")
    fun takeScreenshotAndSave(filePath: String, callback: ((Boolean, String?) -> Unit)? = null) {
        takeScreenshot { bitmap ->
            if (bitmap != null) {
                serviceScope.launch(Dispatchers.IO) {
                    try {
                        val file = File(filePath)
                        file.parentFile?.mkdirs()
                        
                        FileOutputStream(file).use { out ->
                            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                        }
                        
                        mainHandler.post {
                            Log.d(TAG, "截图已保存: $filePath")
                            onScreenshotSaved?.invoke(filePath)
                            callback?.invoke(true, filePath)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "保存截图失败: ${e.message}")
                        mainHandler.post {
                            callback?.invoke(false, e.message)
                        }
                    } finally {
                        bitmap.recycle()
                    }
                }
            } else {
                Log.w(TAG, "截图为空")
                callback?.invoke(false, "截图为空")
            }
        }
    }
    
    // ==================== 元素查找 ====================
    
    /**
     * 在主线程执行查找操作
     */
    fun findNodeByTextOnMain(text: String, clickable: Boolean = true, callback: (AccessibilityNodeInfo?) -> Unit) {
        mainHandler.post {
            val node = findNodeByText(text, clickable)
            callback(node)
        }
    }
    
    fun findNodeByText(text: String, clickable: Boolean = true): AccessibilityNodeInfo? {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "findNodeByText 尝试在非主线程调用，已在主线程重新执行")
            var result: AccessibilityNodeInfo? = null
            val latch = CountDownLatch(1)
            mainHandler.post {
                result = findNodeByTextInternal(text, clickable)
                latch.countDown()
            }
            latch.await(5, TimeUnit.SECONDS)
            return result
        }
        return findNodeByTextInternal(text, clickable)
    }
    
    private fun findNodeByTextInternal(text: String, clickable: Boolean): AccessibilityNodeInfo? {
        val rootNode = rootInActiveWindow ?: return null
        
        try {
            val result = findNodeByTextRecursive(rootNode, text, clickable)
            if (result == null) {
                rootNode.recycle()
            }
            return result
        } catch (e: Exception) {
            Log.e(TAG, "查找元素失败: ${e.message}")
            try {
                rootNode.recycle()
            } catch (recycleError: Exception) {
                // 忽略
            }
            return null
        }
    }
    
    private fun findNodeByTextRecursive(
        node: AccessibilityNodeInfo,
        text: String,
        clickable: Boolean
    ): AccessibilityNodeInfo? {
        val nodeText = node.text?.toString() ?: ""
        val contentDesc = node.contentDescription?.toString() ?: ""
        
        val textMatches = nodeText.contains(text, ignoreCase = true) || 
                          contentDesc.contains(text, ignoreCase = true)
        val clickableMatches = !clickable || node.isClickable
        
        if (textMatches && clickableMatches) {
            return node
        }
        
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            
            val result = findNodeByTextRecursive(child, text, clickable)
            
            if (result != null) {
                return result
            }
        }
        
        return null
    }
    
    fun findNodeByViewId(viewId: String): AccessibilityNodeInfo? {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "findNodeByViewId 尝试在非主线程调用，已在主线程重新执行")
            var result: AccessibilityNodeInfo? = null
            val latch = CountDownLatch(1)
            mainHandler.post {
                result = findNodeByViewIdInternal(viewId)
                latch.countDown()
            }
            latch.await(5, TimeUnit.SECONDS)
            return result
        }
        return findNodeByViewIdInternal(viewId)
    }
    
    private fun findNodeByViewIdInternal(viewId: String): AccessibilityNodeInfo? {
        val rootNode = rootInActiveWindow ?: return null
        
        try {
            val nodes = rootNode.findAccessibilityNodeInfosByViewId(viewId)
            
            if (nodes.isNotEmpty()) {
                return nodes[0]
            } else {
                rootNode.recycle()
                return null
            }
        } catch (e: Exception) {
            Log.e(TAG, "按ID查找失败: ${e.message}")
            try {
                rootNode.recycle()
            } catch (recycleError: Exception) {
                // 忽略
            }
            return null
        }
    }
    
    fun findNodeByConditions(conditions: Map<String, Any>): AccessibilityNodeInfo? {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "findNodeByConditions 尝试在非主线程调用，已在主线程重新执行")
            var result: AccessibilityNodeInfo? = null
            val latch = CountDownLatch(1)
            mainHandler.post {
                result = findNodeByConditionsInternal(conditions)
                latch.countDown()
            }
            latch.await(5, TimeUnit.SECONDS)
            return result
        }
        return findNodeByConditionsInternal(conditions)
    }
    
    private fun findNodeByConditionsInternal(conditions: Map<String, Any>): AccessibilityNodeInfo? {
        val rootNode = rootInActiveWindow ?: return null
        
        try {
            return findNodeByConditionsRecursive(rootNode, conditions)
        } catch (e: Exception) {
            Log.e(TAG, "按条件查找失败: ${e.message}")
            try {
                rootNode.recycle()
            } catch (recycleError: Exception) {
                // 忽略
            }
            return null
        }
    }
    
    private fun findNodeByConditionsRecursive(
        node: AccessibilityNodeInfo,
        conditions: Map<String, Any>
    ): AccessibilityNodeInfo? {
        var match = true
        
        conditions["text"]?.let { text ->
            val nodeText = node.text?.toString() ?: ""
            val contentDesc = node.contentDescription?.toString() ?: ""
            match = match && (nodeText.contains(text as String, ignoreCase = true) || 
                            contentDesc.contains(text, ignoreCase = true))
        }
        
        conditions["clickable"]?.let { clickable ->
            match = match && (node.isClickable == (clickable as Boolean))
        }
        
        conditions["enabled"]?.let { enabled ->
            match = match && (node.isEnabled == (enabled as Boolean))
        }
        
        if (match) {
            return node
        }
        
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findNodeByConditionsRecursive(child, conditions)
            
            if (result != null) {
                return result
            }
            
            child.recycle()
        }
        
        return null
    }
    
    fun getClickableNodes(): List<AccessibilityNodeInfo> {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "getClickableNodes 尝试在非主线程调用，已在主线程重新执行")
            val result = mutableListOf<AccessibilityNodeInfo>()
            val latch = CountDownLatch(1)
            mainHandler.post {
                collectClickableNodesOnMain(result)
                latch.countDown()
            }
            latch.await(5, TimeUnit.SECONDS)
            return result
        }
        
        val result = mutableListOf<AccessibilityNodeInfo>()
        collectClickableNodesOnMain(result)
        return result
    }
    
    private fun collectClickableNodesOnMain(result: MutableList<AccessibilityNodeInfo>) {
        val rootNode = rootInActiveWindow ?: return
        
        try {
            collectClickableNodes(rootNode, result)
        } catch (e: Exception) {
            Log.e(TAG, "获取可点击元素失败: ${e.message}")
        }
    }
    
    private fun collectClickableNodes(node: AccessibilityNodeInfo, result: MutableList<AccessibilityNodeInfo>) {
        if (node.isClickable && node.isVisibleToUser) {
            result.add(node)
        }
        
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectClickableNodes(child, result)
        }
    }
    
    // ==================== 操作执行 ====================
    
    fun click(x: Float, y: Float, callback: ((Boolean) -> Unit)? = null) {
        performClick(x, y, false, 200L, callback)
    }
    
    fun longClick(x: Float, y: Float, duration: Long = 1000, callback: ((Boolean) -> Unit)? = null) {
        performClick(x, y, true, duration, callback)
    }
    
    @SuppressLint("MissingPermission")
    private fun performClick(x: Float, y: Float, isLongPress: Boolean, clickDuration: Long, callback: ((Boolean) -> Unit)?) {
        val gestureBuilder = GestureDescription.Builder()
        val path = android.graphics.Path().apply {
            moveTo(x, y)
        }
        
        val strokeBuilder = GestureDescription.StrokeDescription(
            path,
            0,
            clickDuration
        )
        
        gestureBuilder.addStroke(strokeBuilder)
        
        val gesture = gestureBuilder.build()
        
        val success = dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "点击完成: ($x, $y), 长按=$isLongPress")
                mainHandler.post {
                    callback?.invoke(true)
                }
            }
            
            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "点击取消: ($x, $y)")
                mainHandler.post {
                    callback?.invoke(false)
                }
            }
        }, null)
        
        if (!success) {
            Log.e(TAG, "点击分发失败")
            callback?.invoke(false)
        }
    }
    
    @SuppressLint("MissingPermission")
    fun clickByText(text: String, isLongPress: Boolean = false, callback: ((Boolean) -> Unit)? = null) {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "clickByText 尝试在非主线程调用，已在主线程重新执行")
            mainHandler.post {
                clickByTextInternal(text, isLongPress, callback)
            }
            return
        }
        clickByTextInternal(text, isLongPress, callback)
    }
    
    @SuppressLint("MissingPermission")
    private fun clickByTextInternal(text: String, isLongPress: Boolean, callback: ((Boolean) -> Unit)?) {
        val node = findNodeByText(text, clickable = true)
        
        if (node != null) {
            try {
                val bounds = android.graphics.Rect()
                node.getBoundsInScreen(bounds)
                
                val centerX = bounds.centerX().toFloat()
                val centerY = bounds.centerY().toFloat()
                
                Log.d(TAG, "找到元素 [$text], 位置: ($centerX, $centerY)")
                
                val duration = if (isLongPress) 1000L else 200L
                performClick(centerX, centerY, isLongPress, duration) { success ->
                    node.recycle()
                    callback?.invoke(success)
                }
            } catch (e: Exception) {
                Log.e(TAG, "点击元素失败: ${e.message}")
                try {
                    node.recycle()
                } catch (recycleError: Exception) {
                    // 忽略
                }
                callback?.invoke(false)
            }
        } else {
            Log.w(TAG, "未找到元素: $text")
            callback?.invoke(false)
        }
    }
    
    @SuppressLint("MissingPermission")
    fun clickByViewId(viewId: String, isLongPress: Boolean = false, callback: ((Boolean) -> Unit)? = null) {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "clickByViewId 尝试在非主线程调用，已在主线程重新执行")
            mainHandler.post {
                clickByViewIdInternal(viewId, isLongPress, callback)
            }
            return
        }
        clickByViewIdInternal(viewId, isLongPress, callback)
    }
    
    @SuppressLint("MissingPermission")
    private fun clickByViewIdInternal(viewId: String, isLongPress: Boolean, callback: ((Boolean) -> Unit)?) {
        val node = findNodeByViewId(viewId)
        
        if (node != null) {
            try {
                val bounds = android.graphics.Rect()
                node.getBoundsInScreen(bounds)
                
                val centerX = bounds.centerX().toFloat()
                val centerY = bounds.centerY().toFloat()
                
                Log.d(TAG, "找到元素 [id=$viewId], 位置: ($centerX, $centerY)")
                
                val duration = if (isLongPress) 1000L else 200L
                performClick(centerX, centerY, isLongPress, duration) { success ->
                    node.recycle()
                    callback?.invoke(success)
                }
            } catch (e: Exception) {
                Log.e(TAG, "点击元素失败: ${e.message}")
                try {
                    node.recycle()
                } catch (recycleError: Exception) {
                    // 忽略
                }
                callback?.invoke(false)
            }
        } else {
            Log.w(TAG, "未找到元素: $viewId")
            callback?.invoke(false)
        }
    }
    
    @SuppressLint("MissingPermission")
    fun swipe(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        duration: Long = 500,
        callback: ((Boolean) -> Unit)? = null
    ) {
        val gestureBuilder = GestureDescription.Builder()
        val path = android.graphics.Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        
        val strokeBuilder = GestureDescription.StrokeDescription(path, 0, duration)
        gestureBuilder.addStroke(strokeBuilder)
        
        val gesture = gestureBuilder.build()
        
        dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "滑动完成: ($startX,$startY) -> ($endX,$endY)")
                mainHandler.post {
                    callback?.invoke(true)
                }
            }
            
            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "滑动取消")
                mainHandler.post {
                    callback?.invoke(false)
                }
            }
        }, null)
    }
    
    @SuppressLint("MissingPermission")
    fun pullToRefresh(callback: ((Boolean) -> Unit)? = null) {
        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        
        val startX = screenWidth / 2f
        val startY = screenHeight / 3f
        val endX = startX
        val endY = screenHeight * 2 / 3f
        
        swipe(startX, startY, endX, endY, 500, callback)
    }
    
    @SuppressLint("MissingPermission")
    fun scrollUp(callback: ((Boolean) -> Unit)? = null) {
        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        
        val startX = screenWidth / 2f
        val startY = screenHeight * 2 / 3f
        val endX = startX
        val endY = screenHeight / 3f
        
        swipe(startX, startY, endX, endY, 500, callback)
    }
    
    @SuppressLint("MissingPermission")
    fun scrollDown(callback: ((Boolean) -> Unit)? = null) {
        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        
        val startX = screenWidth / 2f
        val startY = screenHeight / 3f
        val endX = startX
        val endY = screenHeight * 2 / 3f
        
        swipe(startX, startY, endX, endY, 500, callback)
    }
    
    // ==================== 输入操作 ====================
    
    fun inputText(text: String, callback: ((Boolean) -> Unit)? = null) {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "inputText 尝试在非主线程调用，已在主线程重新执行")
            mainHandler.post {
                inputTextInternal(text, callback)
            }
            return
        }
        inputTextInternal(text, callback)
    }
    
    /**
     * 清空输入框
     */
    fun clearInput(callback: ((Boolean) -> Unit)? = null) {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "clearInput 尝试在非主线程调用，已在主线程重新执行")
            mainHandler.post {
                clearInputInternal(callback)
            }
            return
        }
        clearInputInternal(callback)
    }
    
    private fun clearInputInternal(callback: ((Boolean) -> Unit)?) {
        val focusedNode = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        
        if (focusedNode != null) {
            try {
                // 使用 ACTION_SET_TEXT 设置空字符串来清空输入框
                val arguments = Bundle().apply {
                    putString(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
                }
                
                val success = focusedNode.performAction(
                    AccessibilityNodeInfo.ACTION_SET_TEXT,
                    arguments
                )
                
                Log.d(TAG, "清空输入框: 成功: $success")
                focusedNode.recycle()
                callback?.invoke(success)
            } catch (e: Exception) {
                Log.e(TAG, "清空输入框失败: ${e.message}")
                try {
                    focusedNode.recycle()
                } catch (recycleError: Exception) {
                    // 忽略
                }
                callback?.invoke(false)
            }
        } else {
            Log.w(TAG, "未找到输入框")
            callback?.invoke(false)
        }
    }
    
    private fun inputTextInternal(text: String, callback: ((Boolean) -> Unit)?) {
        val focusedNode = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        
        if (focusedNode != null) {
            try {
                val arguments = Bundle().apply {
                    putString(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                }
                
                val success = focusedNode.performAction(
                    AccessibilityNodeInfo.ACTION_SET_TEXT,
                    arguments
                )
                
                Log.d(TAG, "输入文本: $text, 成功: $success")
                focusedNode.recycle()
                callback?.invoke(success)
            } catch (e: Exception) {
                Log.e(TAG, "输入文本失败: ${e.message}")
                try {
                    focusedNode.recycle()
                } catch (recycleError: Exception) {
                    // 忽略
                }
                callback?.invoke(false)
            }
        } else {
            Log.w(TAG, "未找到输入框")
            pasteText(text, callback)
        }
    }
    
    @Suppress("DEPRECATION")
    fun pasteText(text: String, callback: ((Boolean) -> Unit)? = null) {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "pasteText 尝试在非主线程调用，已在主线程重新执行")
            mainHandler.post {
                pasteTextInternal(text, callback)
            }
            return
        }
        pasteTextInternal(text, callback)
    }
    
    @Suppress("DEPRECATION")
    private fun pasteTextInternal(text: String, callback: ((Boolean) -> Unit)?) {
        try {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = android.content.ClipData.newPlainText("ZBB Input", text)
            clipboard.setPrimaryClip(clip)
            
            val focusedNode = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focusedNode != null) {
                try {
                    val success = focusedNode.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                    Log.d(TAG, "粘贴文本: $text, 成功: $success")
                    focusedNode.recycle()
                    callback?.invoke(success)
                } catch (e: Exception) {
                    focusedNode.recycle()
                    callback?.invoke(false)
                }
            } else {
                callback?.invoke(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "粘贴文本失败: ${e.message}")
            callback?.invoke(false)
        }
    }
    
    // ==================== 剪贴板操作 ====================
    
    @Suppress("DEPRECATION")
    fun getClipboardText(): String? {
        return try {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = clipboard.primaryClip
            if (clip != null && clip.itemCount > 0) {
                clip.getItemAt(0).text?.toString()
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "获取剪贴板失败: ${e.message}")
            null
        }
    }
    
    @Suppress("DEPRECATION")
    fun setClipboardText(text: String): Boolean {
        return try {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = android.content.ClipData.newPlainText("ZBB", text)
            clipboard.setPrimaryClip(clip)
            true
        } catch (e: Exception) {
            Log.e(TAG, "设置剪贴板失败: ${e.message}")
            false
        }
    }
    
    // ==================== 应用操作 ====================
    
    fun isAppInBackground(packageName: String): Boolean {
        return try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            @Suppress("DEPRECATION")
            val runningTasks = activityManager.getRunningTasks(1)
            
            if (runningTasks.isNotEmpty()) {
                val topActivity = runningTasks[0].topActivity
                topActivity?.packageName != packageName
            } else {
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "检查应用状态失败: ${e.message}")
            true
        }
    }
    
    fun getCurrentPackageName(): String? {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "getCurrentPackageName 尝试在非主线程调用，已在主线程重新执行")
            var result: String? = null
            val latch = CountDownLatch(1)
            mainHandler.post {
                result = getCurrentPackageNameInternal()
                latch.countDown()
            }
            latch.await(5, TimeUnit.SECONDS)
            return result
        }
        return getCurrentPackageNameInternal()
    }
    
    private fun getCurrentPackageNameInternal(): String? {
        return try {
            val rootNode = rootInActiveWindow
            val packageName = rootNode?.packageName?.toString()
            rootNode?.recycle()
            packageName
        } catch (e: Exception) {
            Log.e(TAG, "获取包名失败: ${e.message}")
            null
        }
    }
    
    fun showToast(message: String) {
        // Toast 需要在主线程执行
        mainHandler.post {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }
    
    // ==================== 启动应用 ====================
    
    /**
     * 启动指定应用
     * @param packageName 应用包名，如 "com.ss.android.ume" (抖音)
     * @param callback 回调
     */
    fun launchApp(packageName: String, callback: ((Boolean) -> Unit)? = null) {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "launchApp 尝试在非主线程调用，已在主线程重新执行")
            mainHandler.post {
                launchAppInternal(packageName, callback)
            }
            return
        }
        launchAppInternal(packageName, callback)
    }
    
    private fun launchAppInternal(packageName: String, callback: ((Boolean) -> Unit)?) {
        try {
            Log.d(TAG, "正在启动应用: $packageName")
            
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            
            if (launchIntent != null) {
                launchIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
                Log.d(TAG, "应用启动成功: $packageName")
                mainHandler.post {
                    callback?.invoke(true)
                }
            } else {
                Log.w(TAG, "未找到应用: $packageName，请检查包名是否正确")
                mainHandler.post {
                    callback?.invoke(false)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "启动应用失败: ${e.message}")
            mainHandler.post {
                callback?.invoke(false)
            }
        }
    }
    
    // ==================== 等待辅助 ====================
    
    fun waitForCondition(
        condition: () -> Boolean,
        timeout: Long = 10000,
        interval: Long = 500,
        callback: ((Boolean) -> Unit)? = null
    ) {
        serviceScope.launch {
            val startTime = System.currentTimeMillis()
            
            while (System.currentTimeMillis() - startTime < timeout) {
                // 在主线程执行 condition 检查
                var result = false
                val latch = CountDownLatch(1)
                mainHandler.post {
                    result = condition()
                    latch.countDown()
                }
                latch.await()
                
                if (result) {
                    mainHandler.post {
                        callback?.invoke(true)
                    }
                    return@launch
                }
                delay(interval)
            }
            
            mainHandler.post {
                callback?.invoke(false)
            }
        }
    }
    
    fun waitForElement(
        text: String,
        timeout: Long = 10000,
        callback: ((AccessibilityNodeInfo?) -> Unit)? = null
    ) {
        // findNodeByText 已经会在主线程执行，这里直接调用
        waitForCondition(
            condition = { findNodeByText(text, clickable = false) != null },
            timeout = timeout,
            callback = { found ->
                callback?.invoke(null)
            }
        )
    }
    
    // ==================== 截屏功能 ====================
    
    /**
     * 截取屏幕截图（Base64编码）
     * 使用 screencap 命令实现
     */
    fun takeScreenshotBase64(): String? {
        return try {
            val timestamp = System.currentTimeMillis()
            val filePath = "/sdcard/zbb_screenshot_$timestamp.png"
            
            val process = Runtime.getRuntime().exec("screencap -p $filePath")
            val exitCode = process.waitFor()
            
            if (exitCode == 0 && File(filePath).exists()) {
                val file = File(filePath)
                val bytes = file.readBytes()
                file.delete()
                Base64.encodeToString(bytes, Base64.NO_WRAP)
            } else {
                Log.e(TAG, "screencap 命令执行失败")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "截屏失败: ${e.message}")
            null
        }
    }
    
    // ==================== OCR识别 ====================
    
    /**
     * 识别屏幕上的文字
     * 返回识别到的所有文字列表
     */
    fun recognizeText(): List<String> {
        // 确保在主线程执行
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Log.w(TAG, "recognizeText 尝试在非主线程调用，已在主线程重新执行")
            var result: List<String> = emptyList()
            val latch = CountDownLatch(1)
            mainHandler.post {
                result = recognizeTextInternal()
                latch.countDown()
            }
            latch.await(10, TimeUnit.SECONDS)
            return result
        }
        return recognizeTextInternal()
    }
    
    private fun recognizeTextInternal(): List<String> {
        val texts = mutableListOf<String>()
        val rootNode = rootInActiveWindow ?: return texts
        
        try {
            collectTextRecursive(rootNode, texts)
        } catch (e: Exception) {
            Log.e(TAG, "OCR识别失败: ${e.message}")
        } finally {
            rootNode.recycle()
        }
        
        Log.d(TAG, "OCR识别到 ${texts.size} 个文字节点")
        return texts
    }
    
    private fun collectTextRecursive(node: AccessibilityNodeInfo, texts: MutableList<String>) {
        // 获取节点文字
        node.text?.toString()?.let { text ->
            if (text.isNotBlank() && text.length <= 100) {
                texts.add(text)
            }
        }
        
        // 获取ContentDescription
        node.contentDescription?.toString()?.let { desc ->
            if (desc.isNotBlank() && desc.length <= 100 && !texts.contains(desc)) {
                texts.add(desc)
            }
        }
        
        // 递归子节点
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectTextRecursive(child, texts)
            } catch (e: Exception) {
                // 忽略子节点错误
            } finally {
                child.recycle()
            }
        }
    }
    
    /**
     * 检查屏幕上是否包含指定文字
     * @param targetText 要查找的文字
     * @param ignoreCase 是否忽略大小写
     * @return true表示找到
     */
    fun screenContainsText(targetText: String, ignoreCase: Boolean = true): Boolean {
        val texts = recognizeText()
        return texts.any { text ->
            if (ignoreCase) {
                text.contains(targetText, ignoreCase = true)
            } else {
                text.contains(targetText)
            }
        }
    }
    
    /**
     * 等待屏幕上出现指定文字
     * @param targetText 要等待的文字
     * @param timeout 超时时间（毫秒）
     * @return true表示找到，false表示超时
     */
    fun waitForScreenText(targetText: String, timeout: Long = 10000): Boolean {
        val startTime = System.currentTimeMillis()
        
        while (System.currentTimeMillis() - startTime < timeout) {
            if (screenContainsText(targetText)) {
                Log.d(TAG, "找到目标文字: $targetText")
                return true
            }
            Thread.sleep(500)
        }
        
        Log.w(TAG, "等待文字超时: $targetText")
        return false
    }
    
    // ==================== 屏幕尺寸 ====================
    
    /**
     * 获取屏幕尺寸
     * @return Pair(width, height) 或 null
     */
    fun getScreenSize(): Pair<Int, Int>? {
        return try {
            val displayMetrics = resources.displayMetrics
            Pair(displayMetrics.widthPixels, displayMetrics.heightPixels)
        } catch (e: Exception) {
            Log.e(TAG, "获取屏幕尺寸失败: ${e.message}")
            null
        }
    }
}
