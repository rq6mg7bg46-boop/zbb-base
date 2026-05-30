package com.zbb.automation

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.PixelFormat
import android.graphics.Point
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * ZBB 截图前台服务
 * 
 * 核心设计：
 * 1. 服务独立于 Activity 生命周期，持有 MediaProjection 对象
 * 2. 权限授权后，将 MediaProjection 传递给此服务
 * 3. 截图时使用服务持有的 MediaProjection 创建 VirtualDisplay
 * 4. 服务保持前台运行，确保权限稳定
 */
class ScreenshotService : Service() {

    companion object {
        private const val TAG = "ScreenshotService"
        private const val CHANNEL_ID = "ZBB_Screenshot_Channel"
        private const val NOTIFICATION_ID = 10002
        
        // Action 常量
        const val ACTION_INIT_PROJECTION = "com.zbb.automation.INIT_PROJECTION"
        const val ACTION_STOP_SERVICE = "com.zbb.automation.STOP_SERVICE"
        
        // 回调
        var onProjectionReady: (() -> Unit)? = null
        var onProjectionError: ((String) -> Unit)? = null
        
        // 单例引用
        @Volatile
        var instance: ScreenshotService? = null
            private set
        
        /**
         * 启动截图服务
         */
        fun startService(context: Context) {
            try {
                val intent = Intent(context, ScreenshotService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                Log.d(TAG, "截图服务启动命令已发送")
            } catch (e: Exception) {
                Log.e(TAG, "启动截图服务失败: ${e.message}")
            }
        }
        
        /**
         * 停止截图服务
         */
        fun stopService(context: Context) {
            try {
                val intent = Intent(context, ScreenshotService::class.java)
                intent.action = ACTION_STOP_SERVICE
                context.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "停止截图服务失败: ${e.message}")
            }
        }
        
        /**
         * 检查服务是否运行
         */
        fun isRunning(): Boolean = instance != null
    }

    // Binder 用于 IPC 通信
    private val binder = ScreenshotBinder()
    
    inner class ScreenshotBinder : Binder() {
        fun getService(): ScreenshotService = this@ScreenshotService
    }
    
    // MediaProjection 相关
    private var mediaProjection: MediaProjection? = null
    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    
    // 截图状态标志
    private val isCapturing = AtomicBoolean(false)
    
    // 主线程 Handler
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "截图服务 onCreate")
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "截图服务 onStartCommand, action: ${intent?.action}")
        
        when (intent?.action) {
            ACTION_INIT_PROJECTION -> {
                // 初始化 MediaProjection
                val resultCode = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED)
                val resultData = intent.getParcelableExtra<Intent>("resultData")
                
                if (resultCode == Activity.RESULT_OK && resultData != null) {
                    initMediaProjection(resultCode, resultData)
                } else {
                    Log.e(TAG, "初始化 MediaProjection 失败: resultCode=$resultCode")
                    onProjectionError?.invoke("授权失败或用户取消")
                }
            }
            ACTION_STOP_SERVICE -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "截图服务 onDestroy")
        cleanup()
        instance = null
    }
    
    /**
     * 初始化 MediaProjection
     * 由外部（AutomationModule）调用
     */
    fun initMediaProjection(resultCode: Int, data: Intent) {
        try {
            Log.d(TAG, "初始化 MediaProjection, resultCode=$resultCode")
            
            val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) 
                as? MediaProjectionManager
            
            if (projectionManager == null) {
                Log.e(TAG, "无法获取 MediaProjectionManager")
                onProjectionError?.invoke("无法获取 MediaProjectionManager")
                return
            }
            
            mediaProjection = projectionManager.getMediaProjection(resultCode, data)
            
            if (mediaProjection != null) {
                Log.d(TAG, "MediaProjection 初始化成功")
                
                // 注册停止回调
                mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() {
                        Log.d(TAG, "MediaProjection 被系统停止")
                    }
                }, mainHandler)
                
                onProjectionReady?.invoke()
            } else {
                Log.e(TAG, "MediaProjection 创建失败")
                onProjectionError?.invoke("MediaProjection 创建失败")
            }
        } catch (e: Exception) {
            Log.e(TAG, "初始化 MediaProjection 异常: ${e.message}")
            onProjectionError?.invoke(e.message ?: "未知错误")
        }
    }
    
    /**
     * 检查 MediaProjection 是否就绪
     */
    fun isProjectionReady(): Boolean = mediaProjection != null
    
    /**
     * 执行截图
     * 核心方法：使用服务持有的 MediaProjection 创建截图
     * 
     * @param width 截图宽度
     * @param height 截图高度
     * @param timeoutMs 超时时间（毫秒）
     * @return 成功返回 Bitmap，失败返回 null
     */
    @SuppressLint("WrongConstant")
    fun captureScreenshot(width: Int, height: Int, timeoutMs: Long = 2000): Bitmap? {
        Log.d(TAG, ">>> captureScreenshot 开始, 尺寸: ${width}x$height")
        
        val projection = mediaProjection
        if (projection == null) {
            Log.e(TAG, "MediaProjection 未初始化")
            return null
        }
        
        // 防止并发截图
        if (!isCapturing.compareAndSet(false, true)) {
            Log.w(TAG, "截图正在进行中，跳过")
            return null
        }
        
        var resultBitmap: Bitmap? = null
        val latch = CountDownLatch(1)
        
        try {
            // 获取屏幕 Display
            val displayManager = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            val displays = displayManager?.displays
            
            val display: android.view.Display? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                displays?.find { it.state == android.view.Display.STATE_ON }
                    ?: displays?.firstOrNull()
            } else {
                @Suppress("DEPRECATION")
                val wm = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
                wm?.defaultDisplay
            }
            
            if (display == null) {
                Log.e(TAG, "无法获取 Display")
                isCapturing.set(false)
                return null
            }
            
            // 如果未指定尺寸，使用屏幕尺寸
            val screenWidth = if (width <= 0) {
                val size = Point()
                @Suppress("DEPRECATION")
                display.getRealSize(size)
                size.x
            } else width
            
            val screenHeight = if (height <= 0) {
                val size = Point()
                @Suppress("DEPRECATION")
                display.getRealSize(size)
                size.y
            } else height
            
            val densityDpi = resources.displayMetrics.densityDpi
            
            Log.d(TAG, ">>> 创建 ImageReader: ${screenWidth}x$screenHeight")
            
            // 清理旧的 ImageReader
            cleanupImageReader()
            
            // 创建 ImageReader
            imageReader = ImageReader.newInstance(
                screenWidth, screenHeight,
                PixelFormat.RGBA_8888, 2
            )
            
            // 创建 VirtualDisplay
            virtualDisplay = projection.createVirtualDisplay(
                "ScreenshotVirtualDisplay",
                screenWidth, screenHeight,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader!!.surface,
                null,
                mainHandler
            )
            
            Log.d(TAG, ">>> VirtualDisplay 创建成功")
            
            // 等待图像
            val imageAvailableLatch = CountDownLatch(1)
            var imageProcessed = false
            
            imageReader!!.setOnImageAvailableListener({ reader ->
                if (imageProcessed) {
                    return@setOnImageAvailableListener
                }
                
                Log.d(TAG, ">>> OnImageAvailableListener 触发")
                
                val image = reader.acquireLatestImage()
                if (image != null) {
                    try {
                        resultBitmap = processImage(image, screenWidth, screenHeight)
                        imageProcessed = true
                        imageAvailableLatch.countDown()
                        Log.d(TAG, ">>> 图像处理完成")
                    } catch (e: Exception) {
                        Log.e(TAG, ">>> 处理图像失败: ${e.message}")
                    } finally {
                        image.close()
                    }
                } else {
                    Log.d(TAG, ">>> acquireLatestImage 返回 null")
                }
            }, mainHandler)
            
            // 等待图像，超时处理
            try {
                val received = imageAvailableLatch.await(timeoutMs, TimeUnit.MILLISECONDS)
                if (!received) {
                    Log.e(TAG, ">>> 等待图像超时 (${timeoutMs}ms)")
                }
            } catch (e: InterruptedException) {
                Log.e(TAG, ">>> 等待被中断: ${e.message}")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, ">>> 截图异常: ${e.message}")
            e.printStackTrace()
        } finally {
            // 清理资源
            cleanupImageReader()
            isCapturing.set(false)
        }
        
        resultBitmap?.let { bitmap ->
            Log.d(TAG, ">>> 截图成功: ${bitmap.width}x${bitmap.height}")
        }
        
        return resultBitmap
    }
    
    /**
     * 处理 Image 为 Bitmap
     */
    private fun processImage(image: Image, targetWidth: Int, targetHeight: Int): Bitmap? {
        try {
            val planes = image.planes
            val buffer = planes[0].buffer
            val pixelStride = planes[0].pixelStride
            val rowStride = planes[0].rowStride
            
            Log.d(TAG, ">>> pixelStride=$pixelStride, rowStride=$rowStride")
            
            // 计算实际行内填充
            val rowPadding = rowStride - pixelStride * targetWidth
            
            // 创建 Bitmap
            val bitmap = Bitmap.createBitmap(
                if (rowPadding > 0) rowStride / pixelStride else targetWidth,
                targetHeight,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)
            
            // 如果有填充，裁剪到目标尺寸
            return if (rowPadding > 0 && bitmap.width > targetWidth) {
                Bitmap.createBitmap(bitmap, 0, 0, targetWidth, targetHeight)
            } else {
                bitmap
            }
        } catch (e: Exception) {
            Log.e(TAG, ">>> processImage 异常: ${e.message}")
            return null
        }
    }
    
    /**
     * 清理 ImageReader 和 VirtualDisplay 资源
     */
    private fun cleanupImageReader() {
        try {
            virtualDisplay?.release()
            virtualDisplay = null
        } catch (e: Exception) {
            Log.w(TAG, ">>> 清理 VirtualDisplay 失败: ${e.message}")
        }
        
        try {
            imageReader?.close()
            imageReader = null
        } catch (e: Exception) {
            Log.w(TAG, ">>> 清理 ImageReader 失败: ${e.message}")
        }
    }
    
    /**
     * 清理所有资源
     */
    private fun cleanup() {
        cleanupImageReader()
        
        try {
            mediaProjection?.unregisterCallback(object : MediaProjection.Callback() {})
        } catch (e: Exception) {
            // 忽略
        }
        
        try {
            mediaProjection?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "停止 MediaProjection 失败: ${e.message}")
        }
        mediaProjection = null
    }
    
    /**
     * 保存截图到文件
     */
    fun saveScreenshot(bitmap: Bitmap, prefix: String = "screenshot"): String? {
        return try {
            val timestamp = System.currentTimeMillis()
            val filename = "${prefix}_${timestamp}.png"
            
            // 保存到应用私有目录
            val privateFile = File(filesDir, filename)
            FileOutputStream(privateFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            Log.d(TAG, "截图已保存到: ${privateFile.absolutePath}")
            
            // 复制到 Download 目录
            try {
                val downloadDir = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_DOWNLOADS
                )
                val downloadFile = File(downloadDir, filename)
                FileOutputStream(downloadFile).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                }
                Log.d(TAG, "截图已复制到 Download: ${downloadFile.absolutePath}")
            } catch (e: Exception) {
                Log.w(TAG, "复制到 Download 失败: ${e.message}")
            }
            
            privateFile.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "保存截图失败: ${e.message}")
            null
        }
    }
    
    // ==================== 通知相关 ====================
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "ZBB 截图服务",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "用于截图的常驻前台服务"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("ZBB 自动化工具")
            .setContentText("截图服务运行中")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
}
