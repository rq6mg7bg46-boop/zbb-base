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
import java.nio.ByteBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 截图助手类
 * 
 * 使用 MediaProjection API 截取屏幕
 * 支持 Android 12+ (API 31) 前台服务要求
 */
class ScreenshotHelper(
    private val context: Context,
    val resultCode: Int,  // 改为公开
    val data: android.content.Intent  // 改为公开
) {

    private val TAG = "ScreenshotHelper"

    private var mediaProjection: MediaProjection? = null
    private var imageReader: ImageReader? = null
    private var virtualDisplay: android.hardware.display.VirtualDisplay? = null
    
    // 截图状态标志
    private val isHandled = AtomicBoolean(false)
    private val isCompleted = AtomicBoolean(false)
    
    // 屏幕尺寸（从 WindowManager 获取）
    private var screenWidth = 0
    private var screenHeight = 0
    private var screenDensity = 0

    init {
        // 获取屏幕尺寸
        initScreenMetrics()
        
        // Android 12 (API 31) 及以上需要前台服务才能使用 MediaProjection
        Log.d(TAG, "SDK 版本: ${Build.VERSION.SDK_INT}, 设备: ${Build.VERSION.RELEASE}")
        Log.d(TAG, "屏幕尺寸: ${screenWidth}x${screenHeight}, densityDpi: $screenDensity")
        
        if (Build.VERSION.SDK_INT >= 31) {
            Log.d(TAG, "API 31+, 启动前台服务")
            startForegroundService()
            // 等待前台服务启动后再初始化 MediaProjection
            Handler(Looper.getMainLooper()).postDelayed({
                Log.d(TAG, "延迟初始化 MediaProjection")
                initMediaProjection()
            }, 300)
        } else {
            initMediaProjection()
        }
    }

    /**
     * 初始化屏幕尺寸
     */
    private fun initScreenMetrics() {
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        
        // 获取实际屏幕尺寸
        val realWidth = metrics.widthPixels
        val realHeight = metrics.heightPixels
        
        // 设置截图分辨率 - 使用 1080p (如果屏幕支持)
        // 也可以设置为更高分辨率如 1440p
        screenWidth = 1080  // 固定宽度 1080
        screenHeight = (realHeight * (1080.0 / realWidth)).toInt()  // 按比例计算高度
        
        // 确保高度不超过屏幕实际高度
        if (screenHeight > realHeight) {
            screenHeight = realHeight
        }
        
        screenDensity = metrics.densityDpi
        
        Log.d(TAG, "实际屏幕: ${realWidth}x${realHeight}")
        Log.d(TAG, "截图分辨率: ${screenWidth}x${screenHeight}")
        
        // 考虑屏幕旋转，使用最大尺寸
        @Suppress("DEPRECATION")
        val rotation = windowManager.defaultDisplay.rotation
        if (rotation == android.view.Surface.ROTATION_90 || rotation == android.view.Surface.ROTATION_270) {
            // 旋转了，交换宽高
            val temp = screenWidth
            screenWidth = screenHeight
            screenHeight = temp
        }
    }

    /**
     * 启动前台服务（API 31+ 必须）
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

            // 启动前台服务
            if (Build.VERSION.SDK_INT >= 31) {
                Log.d(TAG, "使用 startForegroundService (API ${Build.VERSION.SDK_INT})")
                context.startForegroundService(Intent(context, MediaProjectionService::class.java))
            } else {
                Log.d(TAG, "使用 startService (API ${Build.VERSION.SDK_INT})")
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
     * @param callback 截图结果回调，path 为相册路径，error 为错误信息
     */
    fun capture(callback: (String?, String?) -> Unit) {
        val projection = mediaProjection
        
        if (projection == null) {
            callback(null, "MediaProjection 未初始化")
            return
        }

        Log.d(TAG, "开始截图... 屏幕尺寸: ${screenWidth}x${screenHeight}")

        // 重置状态
        isHandled.set(false)
        isCompleted.set(false)

        // 截取屏幕并保存
        try {
            // 创建 ImageReader
            val reader = ImageReader.newInstance(
                screenWidth, screenHeight, PixelFormat.RGBA_8888, 2
            )
            Log.d(TAG, "ImageReader 创建成功")

            // 创建回调 Handler，确保在主线程执行
            val callbackHandler = Handler(Looper.getMainLooper())

            // 设置图像可用监听器
            reader.setOnImageAvailableListener({ imageReader ->
                if (isHandled.get()) {
                    Log.d(TAG, "图片已被处理，跳过")
                    try { imageReader.acquireLatestImage()?.close() } catch (e: Exception) {}
                    return@setOnImageAvailableListener
                }
                
                Log.d(TAG, "OnImageAvailableListener 被调用")
                
                try {
                    val image = imageReader.acquireLatestImage()
                    if (image != null) {
                        if (!isHandled.compareAndSet(false, true)) {
                            image.close()
                            return@setOnImageAvailableListener
                        }
                        
                        Log.d(TAG, "成功获取图像")
                        
                        val planes = image.planes
                        val buffer = planes[0].buffer
                        val pixelStride = planes[0].pixelStride
                        val rowStride = planes[0].rowStride

                        Log.d(TAG, "buffer.remaining = ${buffer.remaining()}")
                        Log.d(TAG, "pixelStride = $pixelStride, rowStride = $rowStride")

                        // 正确处理 pixelStride 和 rowStride
                        val rowPadding = rowStride - pixelStride * screenWidth
                        
                        // 创建 Bitmap
                        val bitmap = Bitmap.createBitmap(
                            screenWidth, screenHeight, Bitmap.Config.ARGB_8888
                        )
                        
                        // 手动复制像素数据，正确处理 stride
                        val pixels = ByteArray(screenWidth * screenHeight * 4)
                        var offset = 0
                        val rowStrideActual = pixelStride * screenWidth + rowPadding
                        
                        for (y in 0 until screenHeight) {
                            buffer.position(y * rowStrideActual)
                            buffer.get(pixels, offset, rowStrideActual - rowPadding)
                            offset += screenWidth * 4
                        }
                        
                        bitmap.copyPixelsFromBuffer(ByteBuffer.wrap(pixels).rewind())
                        Log.d(TAG, "Bitmap 创建成功: ${bitmap.width}x${bitmap.height}")

                        // 清理 ImageReader 和 VirtualDisplay
                        try {
                            image.close()
                            reader.close()
                            virtualDisplay?.release()
                            virtualDisplay = null
                        } catch (e: Exception) {
                            Log.e(TAG, "清理资源异常: ${e.message}")
                        }

                        // 保存到相册（完成后回调）
                        saveToGallery(bitmap) { path, error ->
                            if (error != null) {
                                Log.e(TAG, "保存相册失败: $error")
                            } else {
                                Log.d(TAG, "已保存到相册: $path")
                            }
                            // 在主线程回调
                            callbackHandler.post {
                                callback(path, error)
                            }
                        }
                    } else {
                        Log.d(TAG, "acquireLatestImage 返回 null，等待下一帧...")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "处理图像失败: ${e.message}")
                    callbackHandler.post {
                        callback(null, "处理图像失败: ${e.message}")
                    }
                }
            }, callbackHandler)

            // 创建虚拟显示器（移除 FLAG_SECURE 以便截取其他 APP）
            virtualDisplay = projection.createVirtualDisplay(
                "ScreenCapture",
                screenWidth, screenHeight,
                screenDensity,
                0,  // 移除 FLAG_SECURE，允许截取所有内容
                reader.surface,
                null,
                null
            )
            Log.d(TAG, "VirtualDisplay 创建成功")

        } catch (e: Exception) {
            Log.e(TAG, "截图异常: ${e.message}")
            callback(null, "截图异常: ${e.message}")
        }
    }

    /**
     * 创建虚拟显示器并捕获
     */
    private fun createVirtualDisplayAndCapture(
        reader: ImageReader,
        projection: MediaProjection,
        handler: Handler,
        latch: CountDownLatch,
        onResult: (String?, String?) -> Unit
    ) {
        try {
            virtualDisplay = projection.createVirtualDisplay(
                "ScreenCapture",
                screenWidth, screenHeight,
                screenDensity,
                android.view.Display.FLAG_SECURE,
                reader.surface,
                null,
                handler
            )
            Log.d(TAG, "重新创建 VirtualDisplay 成功")
        } catch (e: Exception) {
            Log.e(TAG, "重新创建 VirtualDisplay 失败: ${e.message}")
            onResult(null, "创建虚拟显示器失败: ${e.message}")
            isCompleted.set(true)
            latch.countDown()
        }
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
     * 保存截图到相册（永久保存）
     */
    private fun saveToGallery(bitmap: Bitmap, callback: (String?, String?) -> Unit) {
        val timestamp = System.currentTimeMillis()
        val filename = "ZBB_Screenshot_$timestamp.jpg"
        
        try {
            val contentValues = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, filename)
                put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                put(android.provider.MediaStore.Images.Media.DATE_ADDED, timestamp / 1000)
                put(android.provider.MediaStore.Images.Media.DATE_MODIFIED, timestamp / 1000)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures")
                    put(android.provider.MediaStore.Images.Media.IS_PENDING, 1)
                }
            }

            val resolver = context.contentResolver
            val imageUri = resolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)

            if (imageUri != null) {
                resolver.openOutputStream(imageUri)?.use { outputStream ->
                    // 使用 JPEG 格式，质量 90%
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 90, outputStream)
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    contentValues.clear()
                    contentValues.put(android.provider.MediaStore.Images.Media.IS_PENDING, 0)
                    resolver.update(imageUri, contentValues, null, null)
                }

                val savedPath = "Pictures/$filename"
                Log.d(TAG, "截图已保存到相册: $savedPath")
                callback(savedPath, null)
            } else {
                callback(null, "无法创建相册条目")
            }
        } catch (e: Exception) {
            Log.e(TAG, "保存到相册失败: ${e.message}")
            e.printStackTrace()
            callback(null, "保存到相册失败: ${e.message}")
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
 * 前台服务（用于 API 31+ MediaProjection）
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
