package com.zbb.screenshot

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.accessibility.AccessibilityManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private val TAG = "ScreenshotTest"

    // Views
    private lateinit var btnRequestPermission: Button
    private lateinit var btnCapture: Button
    private lateinit var btnOcr: Button
    private lateinit var btnSaveToGallery: Button
    private lateinit var tvStatus: TextView
    private lateinit var ivPreview: ImageView
    private lateinit var etKeyword: EditText
    private lateinit var btnFindAndClick: Button
    private lateinit var btnOpenFloatingWindow: Button
    private lateinit var btnCloseFloatingWindow: Button
    private lateinit var btnTestImage: Button

    // Helpers
    private var mediaProjectionManager: MediaProjectionManager? = null
    private var screenshotHelper: ScreenshotHelper? = null
    private var floatingWindowService: FloatingWindowService? = null
    // 注意：OcrHelper 是 object，不需要实例化，直接使用 OcrHelper.method() 即可
    
    // 广播接收器：接收悬浮窗服务的权限请求
    private val permissionRequestReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                "com.zbb.screenshot.REQUEST_PERMISSION" -> {
                    Log.d(TAG, "收到悬浮窗权限请求，开始请求截图权限...")
                    requestMediaProjection()
                }
            }
        }
    }
    private var lastBitmap: android.graphics.Bitmap? = null
    private var lastScreenshotPath: String? = null

    // Activity Result Launchers
    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            Log.d(TAG, "MediaProjection 权限授权成功")
            runOnUiThread {
                tvStatus.text = "状态: 权限授权成功"
            }

            // 初始化截图助手
            screenshotHelper = ScreenshotHelper(this, result.resultCode, result.data!!)
            
            // 将权限信息传给 FloatingWindowService
            FloatingWindowService.resultCode = result.resultCode
            FloatingWindowService.resultData = result.data
            
            // 如果悬浮窗已启动，更新截图助手
            if (floatingWindowService != null) {
                floatingWindowService?.setScreenshotHelper(screenshotHelper)
            }
            
            runOnUiThread {
                btnCapture.isEnabled = true
                btnOcr.isEnabled = true
                btnFindAndClick.isEnabled = true
                tvStatus.append("\n可以开始截图和OCR识别了")
            }
        } else {
            Log.d(TAG, "MediaProjection 权限授权失败或取消")
            runOnUiThread {
                tvStatus.text = "状态: 权限授权失败或取消"
                btnCapture.isEnabled = false
                btnOcr.isEnabled = false
                btnFindAndClick.isEnabled = false
            }
        }
    }

    private val storagePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Toast.makeText(this, "存储权限已授予", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "存储权限被拒绝", Toast.LENGTH_SHORT).show()
        }
    }

    // 图片选择器
    private val imagePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            Log.d(TAG, "选择了图片: $uri")
            processSelectedImage(uri)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        checkPermissions()
        checkAccessibilityService()
        
        // 注册广播接收器
        val filter = android.content.IntentFilter("com.zbb.screenshot.REQUEST_PERMISSION")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(permissionRequestReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(permissionRequestReceiver, filter)
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(permissionRequestReceiver)
        } catch (e: Exception) {
            // 忽略
        }
        OcrHelper.close()
        screenshotHelper?.release()
    }

    private fun initViews() {
        btnRequestPermission = findViewById(R.id.btnRequestPermission)
        btnCapture = findViewById(R.id.btnCapture)
        btnOcr = findViewById(R.id.btnOcr)
        btnSaveToGallery = findViewById(R.id.btnSaveToGallery)
        tvStatus = findViewById(R.id.tvStatus)
        ivPreview = findViewById(R.id.ivPreview)
        etKeyword = findViewById(R.id.etKeyword)
        btnFindAndClick = findViewById(R.id.btnFindAndClick)
        btnOpenFloatingWindow = findViewById(R.id.btnOpenFloatingWindow)
        btnCloseFloatingWindow = findViewById(R.id.btnCloseFloatingWindow)
        btnTestImage = findViewById(R.id.btnTestImage)

        // 默认禁用
        btnCapture.isEnabled = false
        btnOcr.isEnabled = false  // 截图权限授权后启用
        btnSaveToGallery.isEnabled = false
        btnFindAndClick.isEnabled = false  // 截图权限授权后启用

        // 设置按钮点击事件
        btnRequestPermission.setOnClickListener {
            requestMediaProjection()
        }

        btnCapture.setOnClickListener {
            captureScreenshot()
        }

        btnOcr.setOnClickListener {
            performOcr()
        }

        btnSaveToGallery.setOnClickListener {
            Toast.makeText(this, "截图已自动保存到相册", Toast.LENGTH_SHORT).show()
        }

        btnFindAndClick.setOnClickListener {
            findTextAndClick()
        }

        // 悬浮窗按钮
        btnOpenFloatingWindow.setOnClickListener {
            requestOverlayPermission()
        }

        btnCloseFloatingWindow.setOnClickListener {
            stopFloatingWindow()
        }

        // 测试图片按钮
        btnTestImage.setOnClickListener {
            openImagePicker()
        }
    }

    /**
     * 打开图片选择器
     */
    private fun openImagePicker() {
        // OcrHelper 是 object，直接使用
        // 打开图片选择器
        imagePickerLauncher.launch("image/*")
    }

    /**
     * 处理选择的图片
     */
    private fun processSelectedImage(uri: android.net.Uri) {
        runOnUiThread {
            tvStatus.text = "状态: 正在加载图片..."
        }

        try {
            // 从 URI 加载图片
            val inputStream = contentResolver.openInputStream(uri)
            val bitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
            inputStream?.close()

            if (bitmap == null) {
                runOnUiThread {
                    tvStatus.text = "状态: 图片加载失败"
                    Toast.makeText(this, "图片加载失败", Toast.LENGTH_SHORT).show()
                }
                return
            }

            lastBitmap = bitmap

            // 显示预览
            runOnUiThread {
                ivPreview.setImageBitmap(bitmap)
                tvStatus.text = "状态: 图片已加载，正在识别...\n(带图像预处理+纠错)"
            }

            // 执行 OCR 识别（OcrHelper 是 object，直接调用）
            OcrHelper.recognize(bitmap) { results, error ->
                runOnUiThread {
                    if (error != null) {
                        tvStatus.text = "状态: OCR 识别失败\n错误: $error"
                        Toast.makeText(this, "OCR 失败: $error", Toast.LENGTH_SHORT).show()
                        return@runOnUiThread
                    }

                    if (results.isNotEmpty()) {
                        val resultText = results.joinToString("\n") {
                            "${it.text} (置信度: ${String.format("%.2f", it.confidence)})"
                        }
                        tvStatus.text = "状态: OCR 识别成功!\n\n识别结果:\n$resultText"
                        Toast.makeText(this, "识别到 ${results.size} 个文本元素", Toast.LENGTH_SHORT).show()
                        
                        Log.d(TAG, "=== OCR 识别结果 ===")
                        results.forEach { r ->
                            Log.d(TAG, "文字: ${r.text}, 置信度: ${r.confidence}, 位置: ${r.boundingBox}")
                        }
                        Log.d(TAG, "====================")
                    } else {
                        tvStatus.text = "状态: 未识别到任何文字"
                        Toast.makeText(this, "未识别到任何文字", Toast.LENGTH_SHORT).show()
                    }
                }
            }

        } catch (e: Exception) {
            Log.e(TAG, "处理图片失败: ${e.message}", e)
            runOnUiThread {
                tvStatus.text = "状态: 处理图片失败\n错误: ${e.message}"
                Toast.makeText(this, "处理图片失败: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun checkPermissions() {
        // 检查存储权限
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
                storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
    }

    /**
     * 请求悬浮窗权限（SYSTEM_ALERT_WINDOW）
     */
    private fun requestOverlayPermission() {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "需要悬浮窗权限，正在请求...", Toast.LENGTH_SHORT).show()
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            overlayPermissionLauncher.launch(intent)
        } else {
            startFloatingWindow()
        }
    }

    private val overlayPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (Settings.canDrawOverlays(this)) {
            startFloatingWindow()
        } else {
            Toast.makeText(this, "悬浮窗权限被拒绝", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * 启动悬浮窗服务
     */
    private fun startFloatingWindow() {
        // 检查是否有截图权限
        if (screenshotHelper == null) {
            Toast.makeText(this, "请先授权截图权限", Toast.LENGTH_SHORT).show()
            return
        }

        // 将权限信息传给 FloatingWindowService（保存到静态变量和 SharedPreferences）
        FloatingWindowService.savePermission(this, screenshotHelper!!.resultCode, screenshotHelper!!.data)
        
        Log.d(TAG, "传递截图权限给悬浮窗服务: resultCode=${screenshotHelper!!.resultCode}")
        
        val serviceIntent = Intent(this, FloatingWindowService::class.java)
        
        // 启动服务
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
        
        Toast.makeText(this, "悬浮窗已开启", Toast.LENGTH_SHORT).show()
    }

    /**
     * 停止悬浮窗服务
     */
    private fun stopFloatingWindow() {
        try {
            floatingWindowService?.let {
                it.hide()
                unbindService(object : android.content.ServiceConnection {
                    override fun onServiceConnected(name: android.content.ComponentName?, service: android.os.IBinder?) {}
                    override fun onServiceDisconnected(name: android.content.ComponentName?) {}
                })
            }
            val serviceIntent = Intent(this, FloatingWindowService::class.java)
            stopService(serviceIntent)
            floatingWindowService = null
            Toast.makeText(this, "悬浮窗已关闭", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e(TAG, "停止悬浮窗失败: ${e.message}")
        }
    }

    /**
     * 使用指定 Bitmap 执行 OCR (ML Kit + 图像预处理 + 纠错)
     */
    private fun performOcrWithBitmap(bitmap: android.graphics.Bitmap) {
        runOnUiThread {
            tvStatus.text = "状态: 正在识别文字（预处理+纠错中）..."
        }

        OcrHelper.recognize(bitmap) { results: List<OcrHelper.OcrResult>, error: String? ->
            runOnUiThread {
                if (error != null) {
                    tvStatus.text = "状态: OCR 识别失败\n错误: $error"
                    Toast.makeText(this, "OCR 失败: $error", Toast.LENGTH_SHORT).show()
                    return@runOnUiThread
                }

                if (results.isNotEmpty()) {
                    lastBitmap = bitmap
                    val allText = results.joinToString("\n") { r -> r.text }
                    val blockCount = results.size

                    tvStatus.text = "状态: OCR 识别成功!\n识别到 ${blockCount} 个文字块\n文字内容:\n$allText"
                    btnFindAndClick.isEnabled = true

                    Log.d(TAG, "OCR 识别成功: ${blockCount} 个文字块")
                    Log.d(TAG, "文字内容:\n$allText")
                } else {
                    tvStatus.text = "状态: 未识别到任何文字"
                    Toast.makeText(this, "未识别到任何文字", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun checkAccessibilityService() {
        val accessibilityManager = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = accessibilityManager.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_GENERIC
        )
        
        val isEnabled = enabledServices.any {
            it.resolveInfo.serviceInfo.packageName == packageName &&
            it.resolveInfo.serviceInfo.name == "$packageName.AutomationAccessibilityService"
        }

        if (!isEnabled) {
            runOnUiThread {
                tvStatus.text = "状态: 请开启无障碍服务以支持自动化操作\n(设置 > 无障碍 > 截图测试 > 开启)"
            }
        } else {
            runOnUiThread {
                tvStatus.text = if (tvStatus.text.contains("权限授权成功")) {
                    tvStatus.text.toString()
                } else {
                    "状态: 无障碍服务已开启\n请授权截图权限"
                }
            }
        }
    }

    private fun requestMediaProjection() {
        mediaProjectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val intent = mediaProjectionManager?.createScreenCaptureIntent()
        
        if (intent != null) {
            runOnUiThread {
                tvStatus.text = "状态: 正在请求截图权限..."
            }
            mediaProjectionLauncher.launch(intent)
        } else {
            runOnUiThread {
                tvStatus.text = "状态: 无法创建截图请求"
                Toast.makeText(this, "设备不支持截图功能", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun captureScreenshot() {
        val helper = screenshotHelper ?: run {
            Toast.makeText(this, "请先授权截图权限", Toast.LENGTH_SHORT).show()
            return
        }

        runOnUiThread {
            tvStatus.text = "状态: 正在截图..."
            btnCapture.isEnabled = false
        }

        helper.capture { path, error ->
            runOnUiThread {
                btnCapture.isEnabled = true

                if (path != null) {
                    lastScreenshotPath = path
                    btnSaveToGallery.isEnabled = false
                    runOnUiThread {
                        tvStatus.text = "状态: 截图成功!\n已保存到: $path"
                    }
                    Toast.makeText(this, "截图已保存，APP将最小化以截取其他APP", Toast.LENGTH_SHORT).show()
                    
                    // 最小化APP以便截取其他APP的屏幕
                    moveTaskToBack(true)
                    
                    // 自动执行 OCR（下次打开时显示结果）
                } else {
                    runOnUiThread {
                        tvStatus.text = "状态: 截图失败\n错误: $error"
                    }
                    Toast.makeText(this, "截图失败: $error", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun performOcr() {
        // 尝试加载最新截图
        loadLatestScreenshot { bitmap ->
            if (bitmap != null) {
                lastBitmap = bitmap
                runOnUiThread {
                    ivPreview.setImageBitmap(bitmap)
                }

                runOnUiThread {
                    tvStatus.text = "状态: 正在 OCR 识别（预处理+纠错中）..."
                }

                OcrHelper.recognize(bitmap) { results: List<OcrHelper.OcrResult>, error: String? ->
                    runOnUiThread {
                        if (error != null) {
                            tvStatus.text = "状态: OCR 识别失败\n错误: $error"
                            Toast.makeText(this, "OCR 失败: $error", Toast.LENGTH_SHORT).show()
                        } else {
                            val resultText = results.joinToString("\n") { r ->
                                "${r.text} (${r.confidence})"
                            }
                            tvStatus.text = "状态: OCR 识别成功!\n\n识别结果:\n$resultText"
                            Toast.makeText(this, "识别到 ${results.size} 个文本元素", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            } else {
                runOnUiThread {
                    tvStatus.text = "状态: 没有可识别的截图\n请先截图"
                }
                Toast.makeText(this, "请先截图", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun findTextAndClick() {
        val keyword = etKeyword.text.toString().trim()
        if (keyword.isEmpty()) {
            Toast.makeText(this, "请输入要查找的关键词", Toast.LENGTH_SHORT).show()
            return
        }

        val bitmap = lastBitmap ?: run {
            Toast.makeText(this, "请先截图", Toast.LENGTH_SHORT).show()
            return
        }

        runOnUiThread {
            tvStatus.text = "状态: 查找 '$keyword' 并点击..."
        }

        OcrHelper.findTextPosition(bitmap, keyword) { position: Pair<Int, Int>?, error: String? ->
            runOnUiThread {
                if (error != null) {
                    tvStatus.text = "状态: 查找失败\n错误: $error"
                    Toast.makeText(this, error, Toast.LENGTH_SHORT).show()
                    return@runOnUiThread
                }

                if (position != null) {
                    val (x, y) = position
                    tvStatus.text = "状态: 找到 '$keyword'!\n坐标: ($x, $y)\n正在点击..."
                    Toast.makeText(this, "找到 '$keyword'，坐标: ($x, $y)", Toast.LENGTH_SHORT).show()

                    // 执行点击
                    performClick(x.toFloat(), y.toFloat())
                } else {
                    tvStatus.text = "状态: 未找到 '$keyword'"
                    Toast.makeText(this, "未找到 '$keyword'", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun performClick(x: Float, y: Float) {
        val accessibilityService = AutomationAccessibilityService.instance
        
        if (accessibilityService != null) {
            accessibilityService.click(x, y, object : android.accessibilityservice.AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: android.accessibilityservice.GestureDescription?) {
                    runOnUiThread {
                        tvStatus.append("\n点击完成!")
                        Toast.makeText(this@MainActivity, "点击完成!", Toast.LENGTH_SHORT).show()
                    }
                }

                override fun onCancelled(gestureDescription: android.accessibilityservice.GestureDescription?) {
                    runOnUiThread {
                        tvStatus.append("\n点击取消")
                        Toast.makeText(this@MainActivity, "点击取消", Toast.LENGTH_SHORT).show()
                    }
                }
            })
        } else {
            Toast.makeText(this, "无障碍服务未开启，无法执行点击", Toast.LENGTH_LONG).show()
            runOnUiThread {
                tvStatus.text = "状态: 请开启无障碍服务\n(设置 > 无障碍 > 截图测试 > 开启)"
            }
        }
    }

    private fun loadLatestScreenshot(callback: (android.graphics.Bitmap?) -> Unit) {
        Thread {
            try {
                // 尝试从应用私有目录加载最新的截图
                val filesDir = filesDir
                val screenshots = filesDir.listFiles { file ->
                    file.name.startsWith("debug_screenshot_") && file.name.endsWith(".png")
                }
                
                if (screenshots != null && screenshots.isNotEmpty()) {
                    // 按时间排序，取最新的
                    val latest = screenshots.maxByOrNull { it.lastModified() }
                    if (latest != null) {
                        val bitmap = BitmapFactory.decodeFile(latest.absolutePath)
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
}
