package com.zbb.screenshot

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import com.zbb.screenshot.databinding.LayoutFloatingButtonBinding
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 悬浮窗服务
 * 在屏幕上层显示悬浮按钮，点击后截取当前屏幕
 */
class FloatingWindowService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: View? = null
    
    // 截图相关
    private var mediaProjectionManager: MediaProjectionManager? = null
    private var screenshotHelper: ScreenshotHelper? = null
    // 注意：OcrHelper 是 object，不需要实例化，直接使用即可
    
    private var onCaptureCallback: ((Bitmap?, String?) -> Unit)? = null
    private var pendingCaptureCallback: ((Bitmap?, String?) -> Unit)? = null
    
    companion object {
        const val TAG = "FloatingWindow"
        const val CHANNEL_ID = "FloatingScreenshotChannel"
        const val NOTIFICATION_ID = 1001
        const val PREFS_NAME = "floating_prefs"
        const val KEY_RESULT_CODE = "result_code"
        const val KEY_RESULT_DATA = "result_data"
        
        var isRunning = false
            private set
        
        // 用于传递截图权限结果
        @JvmStatic var resultCode: Int = -1
        @JvmStatic var resultData: Intent? = null
        
        /**
         * 保存权限信息到 SharedPreferences
         */
        fun savePermission(context: Context, code: Int, data: Intent) {
            resultCode = code
            resultData = data
            
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit()
                    .putInt(KEY_RESULT_CODE, code)
                    .putString(KEY_RESULT_DATA, data.toUri(0))
                    .apply()
                Log.d(TAG, "权限信息已保存: code=$code")
            } catch (e: Exception) {
                Log.e(TAG, "保存权限信息失败: ${e.message}")
            }
        }
        
        /**
         * 从 SharedPreferences 加载权限信息
         */
        fun loadPermission(context: Context): Boolean {
            // 如果静态变量已经有值，直接使用
            if (resultCode != -1 && resultData != null) {
                return true
            }
            
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val code = prefs.getInt(KEY_RESULT_CODE, -1)
                val dataString = prefs.getString(KEY_RESULT_DATA, null)
                
                if (code != -1 && dataString != null) {
                    // 尝试重建 Intent（这可能不完美，但可以作为后备）
                    Log.d(TAG, "从 SharedPreferences 恢复权限信息: code=$code")
                    // 注意：Intent.toUri 和 Intent.parseUri 可能不完全兼容
                    return false // 返回 false 表示需要 MainActivity 重新授权
                }
            } catch (e: Exception) {
                Log.e(TAG, "加载权限信息失败: ${e.message}")
            }
            return false
        }
        
        /**
         * 清除保存的权限信息
         */
        fun clearPermission(context: Context) {
            resultCode = -1
            resultData = null
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .apply()
        }
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        isRunning = true
        
        // OcrHelper 是 object，无需初始化
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: resultCode=$resultCode, resultData=${if (resultData != null) "not null" else "null"}")
        
        // 首先尝试从静态变量或 SharedPreferences 加载权限信息
        if (resultCode == -1 || resultData == null) {
            val loaded = loadPermission(this)
            Log.d(TAG, "尝试加载权限: loaded=$loaded, resultCode=$resultCode")
        }
        
        // 检查是否有截图权限
        if (resultCode == -1 || resultData == null) {
            // 没有权限，请求授权
            Log.d(TAG, "截图权限未初始化，请求授权...")
            requestScreenCapturePermission()
            return START_STICKY
        }
        
        // 有权限，初始化截图助手
        initScreenshotHelper()
        
        // 创建悬浮窗
        createFloatingWindow()
        
        return START_STICKY
    }

    /**
     * 请求截图权限
     */
    private fun requestScreenCapturePermission() {
        // 使用通知权限请求
        val notification = createNotification("需要截图权限，请在主界面授权")
        startForeground(NOTIFICATION_ID, notification)
        
        // 发送广播通知 MainActivity
        val broadcastIntent = Intent("com.zbb.screenshot.REQUEST_PERMISSION")
        broadcastIntent.setPackage(packageName)
        sendBroadcast(broadcastIntent)
        
        Toast.makeText(this, "请打开主界面授权截图权限", Toast.LENGTH_LONG).show()
        
        // 不立即停止，等待 MainActivity 处理
        // stopForeground(STOP_FOREGROUND_REMOVE)
        // stopSelf()
    }
    
    /**
     * 初始化截图助手（在权限授权后调用）
     */
    fun initWithPermission(code: Int, data: Intent) {
        resultCode = code
        resultData = data
        initScreenshotHelper()
        createFloatingWindow()
    }
    
    private fun initScreenshotHelper() {
        if (resultCode != -1 && resultData != null && screenshotHelper == null) {
            Log.d(TAG, "初始化截图助手...")
            screenshotHelper = ScreenshotHelper(this, resultCode, resultData!!)
            
            // 创建前台通知
            val notification = createNotification("悬浮窗已开启，点击按钮截图")
            startForeground(NOTIFICATION_ID, notification)
        }
    }
    
    private fun createNotification(message: String): Notification {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "悬浮窗服务",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "悬浮窗截图服务"
        }
        
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(channel)
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("截图服务")
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    @SuppressLint("ClickableViewAccessibility", "InflateParams")
    private fun createFloatingWindow() {
        // 移除已存在的悬浮窗
        removeFloatingWindow()
        
        // 先尝试初始化截图助手（如果权限已传递）
        if (screenshotHelper == null && resultCode != -1 && resultData != null) {
            initScreenshotHelper()
        }
        
        // 检查截图助手是否初始化
        if (screenshotHelper == null) {
            Log.e(TAG, "截图助手未初始化: resultCode=$resultCode, resultData=${if (resultData != null) "exists" else "null"}")
            Toast.makeText(this, "截图服务未初始化", Toast.LENGTH_SHORT).show()
            return
        }
        
        // 创建悬浮按钮视图
        val binding = LayoutFloatingButtonBinding.inflate(LayoutInflater.from(this))
        floatingView = binding.root
        
        // 设置悬浮窗参数
        val params = WindowManager.LayoutParams().apply {
            type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }
            
            format = PixelFormat.RGBA_8888
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
            gravity = Gravity.TOP or Gravity.START
            
            // 设置悬浮窗初始位置（右上角）
            x = 0
            y = 300
            width = WindowManager.LayoutParams.WRAP_CONTENT
            height = WindowManager.LayoutParams.WRAP_CONTENT
        }
        
        // 添加到窗口
        try {
            windowManager?.addView(floatingView, params)
            Toast.makeText(this, "悬浮窗已显示，点击按钮截图", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "创建悬浮窗失败: ${e.message}", Toast.LENGTH_SHORT).show()
            return
        }
        
        // 设置拖动逻辑
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        
        floatingView?.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager?.updateViewLayout(floatingView, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val deltaX = Math.abs(event.rawX - initialTouchX)
                    val deltaY = Math.abs(event.rawY - initialTouchY)
                    
                    // 如果点击（移动距离小于10），触发截图
                    if (deltaX < 10 && deltaY < 10) {
                        performCapture()
                    }
                    true
                }
                else -> false
            }
        }
    }
    
    /**
     * 设置截图回调
     */
    fun setCaptureCallback(callback: (Bitmap?, String?) -> Unit) {
        onCaptureCallback = callback
    }
    
    /**
     * 执行截图
     */
    private fun performCapture() {
        val helper = screenshotHelper
        if (helper == null) {
            Toast.makeText(this, "截图服务未初始化", Toast.LENGTH_SHORT).show()
            return
        }
        
        // 显示截图中提示
        Toast.makeText(this, "正在截图...", Toast.LENGTH_SHORT).show()
        
        // 隐藏悬浮窗
        floatingView?.visibility = View.INVISIBLE
        
        // 延迟截图，确保悬浮窗已隐藏
        floatingView?.postDelayed({
            helper.capture { path, error ->
                // 恢复悬浮窗显示
                floatingView?.post {
                    floatingView?.visibility = View.VISIBLE
                }
                
                if (error != null) {
                    Toast.makeText(this@FloatingWindowService, "截图失败: $error", Toast.LENGTH_SHORT).show()
                    onCaptureCallback?.invoke(null, error)
                } else {
                    Toast.makeText(this@FloatingWindowService, "截图成功", Toast.LENGTH_SHORT).show()
                    
                    // 加载截图并执行 OCR
                    loadLatestScreenshot { bitmap ->
                        if (bitmap != null) {
                            onCaptureCallback?.invoke(bitmap, null)
                        } else {
                            onCaptureCallback?.invoke(null, "无法加载截图")
                        }
                    }
                }
            }
        }, 100)
    }
    
    /**
     * 加载最新截图
     */
    private fun loadLatestScreenshot(callback: (Bitmap?) -> Unit) {
        Thread {
            try {
                val filesDir = filesDir
                val screenshots = filesDir.listFiles { file ->
                    file.name.startsWith("debug_screenshot_") && file.name.endsWith(".png")
                }
                
                if (screenshots != null && screenshots.isNotEmpty()) {
                    val latest = screenshots.maxByOrNull { it.lastModified() }
                    if (latest != null) {
                        val bitmap = android.graphics.BitmapFactory.decodeFile(latest.absolutePath)
                        callback(bitmap)
                        return@Thread
                    }
                }
                callback(null)
            } catch (e: Exception) {
                Log.e(TAG, "加载截图失败: ${e.message}")
                callback(null)
            }
        }.start()
    }
    
    /**
     * 移除悬浮窗
     */
    private fun removeFloatingWindow() {
        try {
            floatingView?.let {
                windowManager?.removeView(it)
                floatingView = null
            }
        } catch (e: Exception) {
            // 忽略
        }
    }
    
    /**
     * 设置截图助手
     */
    fun setScreenshotHelper(helper: ScreenshotHelper?) {
        screenshotHelper = helper
        if (helper != null && floatingView == null) {
            // 如果已经有 helper 且悬浮窗未创建，则创建悬浮窗
            createFloatingWindow()
        }
    }
    
    /**
     * 显示悬浮窗
     */
    fun show() {
        if (screenshotHelper == null) {
            Toast.makeText(this, "截图服务未初始化", Toast.LENGTH_SHORT).show()
            return
        }
        if (floatingView == null) {
            createFloatingWindow()
        } else {
            floatingView?.visibility = View.VISIBLE
        }
    }
    
    /**
     * 隐藏悬浮窗
     */
    fun hide() {
        floatingView?.visibility = View.INVISIBLE
    }

    override fun onDestroy() {
        removeFloatingWindow()
        screenshotHelper?.release()
        OcrHelper.close()  // OcrHelper 是 object
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
