package com.zbb.screenshot

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
import android.view.WindowManager
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * 截图助手类
 * 
 * 使用 MediaProjection API 截取屏幕
 * 这是 Android 标准且稳定的截图方式
 */
class ScreenshotHelper(
    private val context: Context,
    private val resultCode: Int,
    private val data: android.content.Intent
) {

    private val TAG = "ScreenshotHelper"

    private var mediaProjection: MediaProjection? = null
    private var imageReader: ImageReader? = null
    private var virtualDisplay: android.hardware.display.VirtualDisplay? = null

    init {
        // Android 14 (API 34) 及以上需要前台服务才能使用 MediaProjection
        Log.d(TAG, "SDK 版本: ${Build.VERSION.SDK_INT}, 设备: ${Build.VERSION.RELEASE}")
        if (Build.VERSION.SDK_INT >= 34) {
            Log.d(TAG, "Android 14+, 启动前台服务")
            startForegroundService()
        }
        initMediaProjection()
    }

    /**
     * 启动前台服务（Android 14+ 必须）
     */
    private fun startForegroundService() {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // 创建通知渠道
            val channel = NotificationChannel(
                CHANNEL_ID,
                "屏幕截图服务",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "用于截取屏幕内容"
            }
            notificationManager.createNotificationChannel(channel)

            // 创建通知
            val notification = Notification.Builder(context, CHANNEL_ID)
                .setContentTitle("截图测试")
                .setContentText("正在运行截图服务")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setPriority(Notification.PRIORITY_LOW)
                .build()

            // 启动前台服务（Android 14+ 使用 startForegroundService，Android 13 及以下使用 startService）
            if (Build.VERSION.SDK_INT >= 34) {
                Log.d(TAG, "使用 startForegroundService")
                context.startForegroundService(Intent(context, MediaProjectionService::class.java))
            } else {
                Log.d(TAG, "使用 startService")
                context.startService(Intent(context, MediaProjectionService::class.java))
            }

            Log.d(TAG, "服务启动命令已发送")
        } catch (e: Exception) {
            Log.e(TAG, "启动前台服务失败: ${e.message}")
            e.printStackTrace()
        }
    }

    private fun initMediaProjection() {
        try {
            val projectionManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) 
                as MediaProjectionManager
            
            mediaProjection = projectionManager.getMediaProjection(resultCode, data)
            
            if (mediaProjection != null) {
                Log.d(TAG, "MediaProjection 初始化成功")
            } else {
                Log.e(TAG, "MediaProjection 初始化失败")
            }
        } catch (e: Exception) {
            Log.e(TAG, "初始化 MediaProjection 异常: ${e.message}")
            e.printStackTrace()
        }
    }

    /**
     * 截取屏幕截图
     * 
     * @param callback 截图结果回调
     */
    fun capture(callback: (Bitmap?, String?) -> Unit) {
        val projection = mediaProjection
        
        if (projection == null) {
            callback(null, "MediaProjection 未初始化")
            return
        }

        Log.d(TAG, "开始截图...")

        // 使用 CountDownLatch 等待截图完成
        var resultBitmap: Bitmap? = null
        var errorMsg: String? = null
        val latch = CountDownLatch(1)

        // 获取屏幕尺寸
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val densityDpi = metrics.densityDpi

        Log.d(TAG, "屏幕尺寸: ${width}x${height}, densityDpi: $densityDpi")

        // 在主线程创建 ImageReader
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            Log.d(TAG, "在主线程执行截图")

            try {
                // 创建 ImageReader
                imageReader = ImageReader.newInstance(
                    width, height, PixelFormat.RGBA_8888, 2
                )
                Log.d(TAG, "ImageReader 创建成功")

                val handler = Handler(Looper.getMainLooper())

                // 设置图像可用监听器
                imageReader?.setOnImageAvailableListener({ reader ->
                    Log.d(TAG, "OnImageAvailableListener 被调用")
                    
                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        try {
                            Log.d(TAG, "成功获取图像")
                            
                            val planes = image.planes
                            val buffer = planes[0].buffer
                            val pixelStride = planes[0].pixelStride
                            val rowStride = planes[0].rowStride

                            Log.d(TAG, "buffer.remaining = ${buffer.remaining()}")
                            Log.d(TAG, "pixelStride = $pixelStride, rowStride = $rowStride")

                            // 创建 Bitmap
                            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                            bitmap.copyPixelsFromBuffer(buffer)

                            resultBitmap = bitmap
                            Log.d(TAG, "Bitmap 创建成功: ${bitmap.width}x${bitmap.height}")

                            // 保存到文件便于调试
                            saveDebugScreenshot(bitmap)
                        } catch (e: Exception) {
                            errorMsg = "创建 Bitmap 失败: ${e.message}"
                            Log.e(TAG, errorMsg!!)
                            e.printStackTrace()
                        } finally {
                            image.close()
                            releaseResources()
                            latch.countDown()
                        }
                    } else {
                        Log.d(TAG, "acquireLatestImage 返回 null")
                    }
                }, handler)

                // 创建虚拟显示器
                virtualDisplay = projection.createVirtualDisplay(
                    "ScreenCapture",
                    width, height,
                    densityDpi,
                    android.view.Display.FLAG_PRIVATE,
                    imageReader?.surface,
                    null,
                    handler
                )
                Log.d(TAG, "VirtualDisplay 创建成功")

                // 设置投影回调
                projection.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() {
                        Log.d(TAG, "MediaProjection 已停止")
                        releaseResources()
                    }
                }, handler)

            } catch (e: Exception) {
                errorMsg = "截图异常: ${e.message}"
                Log.e(TAG, errorMsg!!)
                e.printStackTrace()
                releaseResources()
                latch.countDown()
            }
        }

        // 等待截图完成，最多等待 5 秒
        try {
            val completed = latch.await(5, TimeUnit.SECONDS)
            if (!completed) {
                Log.e(TAG, "截图等待超时")
                errorMsg = "截图等待超时"
            }
        } catch (e: InterruptedException) {
            Log.e(TAG, "等待被中断")
            errorMsg = "等待被中断"
        }

        callback(resultBitmap, errorMsg)
    }

    /**
     * 释放资源
     */
    private fun releaseResources() {
        try {
            virtualDisplay?.release()
            virtualDisplay = null
            
            imageReader?.close()
            imageReader = null
            
            Log.d(TAG, "资源已释放")
        } catch (e: Exception) {
            Log.e(TAG, "释放资源异常: ${e.message}")
        }
    }

    /**
     * 保存调试截图到应用私有目录
     */
    private fun saveDebugScreenshot(bitmap: Bitmap) {
        try {
            val timestamp = System.currentTimeMillis()
            val filename = "debug_screenshot_$timestamp.png"
            val file = java.io.File(context.filesDir, filename)

            java.io.FileOutputStream(file).use { fos ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos)
            }

            Log.d(TAG, "调试截图已保存: ${file.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "保存调试截图失败: ${e.message}")
        }
    }

    /**
     * 释放 MediaProjection
     */
    fun release() {
        releaseResources()
        try {
            mediaProjection?.stop()
            mediaProjection = null
        } catch (e: Exception) {
            Log.e(TAG, "停止 MediaProjection 异常: ${e.message}")
        }
    }

    companion object {
        private const val CHANNEL_ID = "screenshot_channel"
    }
}

/**
 * 前台服务（用于 Android 14+ MediaProjection）
 */
class MediaProjectionService : Service() {

    private val TAG = "MediaProjectionService"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "前台服务已创建")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "前台服务启动")
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        val channel = NotificationChannel(
            "screenshot_channel",
            "屏幕截图服务",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "用于截取屏幕内容"
        }
        notificationManager.createNotificationChannel(channel)

        val notification = Notification.Builder(this, "screenshot_channel")
            .setContentTitle("截图测试")
            .setContentText("正在运行截图服务")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setPriority(Notification.PRIORITY_LOW)
            .build()

        startForeground(1, notification)
        
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "前台服务已停止")
    }
}
