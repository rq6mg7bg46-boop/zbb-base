package com.zbb.screenshot

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * 自动化操作助手
 * 使用无障碍服务执行点击、滑动、输入等操作
 */
class AutomationHelper(private val context: Context) {

    private val TAG = "AutomationHelper"

    // 延迟执行时间（毫秒）
    private val defaultDelay = 500L

    /**
     * 点击指定坐标
     * 
     * @param x X 坐标
     * @param y Y 坐标
     * @param callback 执行结果回调
     */
    fun click(x: Float, y: Float, callback: ((Boolean, String?) -> Unit)? = null) {
        Log.d(TAG, "执行点击: ($x, $y)")
        
        val path = Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()

        dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "点击完成")
                callback?.invoke(true, null)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.e(TAG, "点击取消")
                callback?.invoke(false, "点击被取消")
            }
        })
    }

    /**
     * 双击指定坐标
     * 
     * @param x X 坐标
     * @param y Y 坐标
     * @param callback 执行结果回调
     */
    fun doubleClick(x: Float, y: Float, callback: ((Boolean, String?) -> Unit)? = null) {
        Log.d(TAG, "执行双击: ($x, $y)")
        
        // 第一次点击
        click(x, y) { success, error ->
            if (success) {
                // 延迟 100ms 后第二次点击
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    click(x, y, callback)
                }, 100)
            } else {
                callback?.invoke(false, error)
            }
        }
    }

    /**
     * 长按指定坐标
     * 
     * @param x X 坐标
     * @param y Y 坐标
     * @param duration 长按持续时间（毫秒）
     * @param callback 执行结果回调
     */
    fun longClick(x: Float, y: Float, duration: Long = 1000L, callback: ((Boolean, String?) -> Unit)? = null) {
        Log.d(TAG, "执行长按: ($x, $y), 持续: ${duration}ms")
        
        val path = Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()

        dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "长按完成")
                callback?.invoke(true, null)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.e(TAG, "长按取消")
                callback?.invoke(false, "长按被取消")
            }
        })
    }

    /**
     * 滑动操作
     * 
     * @param startX 起始 X 坐标
     * @param startY 起始 Y 坐标
     * @param endX 结束 X 坐标
     * @param endY 结束 Y 坐标
     * @param duration 滑动持续时间（毫秒）
     * @param callback 执行结果回调
     */
    fun swipe(
        startX: Float, startY: Float,
        endX: Float, endY: Float,
        duration: Long = 300L,
        callback: ((Boolean, String?) -> Unit)? = null
    ) {
        Log.d(TAG, "执行滑动: ($startX, $startY) -> ($endX, $endY)")

        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()

        dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "滑动完成")
                callback?.invoke(true, null)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.e(TAG, "滑动取消")
                callback?.invoke(false, "滑动被取消")
            }
        })
    }

    /**
     * 向下滑动
     */
    fun swipeDown(callback: ((Boolean, String?) -> Unit)? = null) {
        val screenHeight = context.resources.displayMetrics.heightPixels
        val screenWidth = context.resources.displayMetrics.widthPixels
        
        swipe(
            screenWidth / 2f, screenHeight / 4f,
            screenWidth / 2f, screenHeight * 3 / 4f,
            callback = callback
        )
    }

    /**
     * 向上滑动
     */
    fun swipeUp(callback: ((Boolean, String?) -> Unit)? = null) {
        val screenHeight = context.resources.displayMetrics.heightPixels
        val screenWidth = context.resources.displayMetrics.widthPixels
        
        swipe(
            screenWidth / 2f, screenHeight * 3 / 4f,
            screenWidth / 2f, screenHeight / 4f,
            callback = callback
        )
    }

    /**
     * 向左滑动
     */
    fun swipeLeft(callback: ((Boolean, String?) -> Unit)? = null) {
        val screenHeight = context.resources.displayMetrics.heightPixels
        val screenWidth = context.resources.displayMetrics.widthPixels
        
        swipe(
            screenWidth * 3 / 4f, screenHeight / 2f,
            screenWidth / 4f, screenHeight / 2f,
            callback = callback
        )
    }

    /**
     * 向右滑动
     */
    fun swipeRight(callback: ((Boolean, String?) -> Unit)? = null) {
        val screenHeight = context.resources.displayMetrics.heightPixels
        val screenWidth = context.resources.displayMetrics.widthPixels
        
        swipe(
            screenWidth / 4f, screenHeight / 2f,
            screenWidth * 3 / 4f, screenHeight / 2f,
            callback = callback
        )
    }

    /**
     * 输入文本
     * 注意：这需要无障碍服务权限才能工作
     * 
     * @param text 要输入的文本
     * @param callback 执行结果回调
     */
    fun inputText(text: String, callback: ((Boolean, String?) -> Unit)? = null) {
        Log.d(TAG, "输入文本: $text")
        // 输入文本需要通过剪贴板或 AccessibilityNodeInfo
        // 这里简化处理，实际可能需要更复杂的实现
        try {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("input", text)
            clipboard.setPrimaryClip(clip)
            
            // 粘贴操作
            val pasteData = android.content.Intent(android.content.Intent.ACTION_PASTE)
            pasteData.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            context.startActivity(pasteData)
            
            callback?.invoke(true, null)
        } catch (e: Exception) {
            Log.e(TAG, "输入文本失败: ${e.message}")
            callback?.invoke(false, "输入文本失败: ${e.message}")
        }
    }

    /**
     * 延迟执行
     * 
     * @param delay 延迟时间（毫秒）
     * @param action 要执行的操作
     */
    fun delay(delay: Long = defaultDelay, action: () -> Unit) {
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            action()
        }, delay)
    }

    /**
     * 点击后延迟执行
     */
    fun clickAndWait(x: Float, y: Float, waitTime: Long = defaultDelay, callback: ((Boolean, String?) -> Unit)? = null) {
        click(x, y) { success, error ->
            if (success) {
                delay(waitTime) {
                    callback?.invoke(true, null)
                }
            } else {
                callback?.invoke(false, error)
            }
        }
    }

    /**
     * 查找并点击包含指定文本的 UI 元素
     * 需要无障碍服务
     */
    fun clickByText(
        rootNode: AccessibilityNodeInfo?,
        text: String,
        clickOnce: Boolean = true,
        callback: ((Boolean, String?) -> Unit)? = null
    ) {
        if (rootNode == null) {
            callback?.invoke(false, "无法获取界面节点")
            return
        }

        val nodes = rootNode.findAccessibilityNodeInfosByText(text)
        
        if (nodes.isNotEmpty()) {
            val node = nodes[0]
            val bounds = android.graphics.Rect()
            node.getBoundsInScreen(bounds)
            
            val centerX = bounds.centerX().toFloat()
            val centerY = bounds.centerY().toFloat()
            
            Log.d(TAG, "找到文本 '$text'，坐标: ($centerX, $centerY)")
            node.recycle()
            
            click(centerX, centerY, callback)
        } else {
            Log.d(TAG, "未找到文本 '$text'")
            callback?.invoke(false, "未找到文本: $text")
        }
    }

    /**
     * 分发手势到无障碍服务
     */
    private fun dispatchGesture(
        gesture: GestureDescription,
        callback: AccessibilityService.GestureResultCallback
    ) {
        // 由于 AutomationHelper 不是 AccessibilityService，
        // 需要通过实际的无障碍服务实例来执行
        val service = AutomationAccessibilityService.instance
        
        if (service != null) {
            // 直接调用无障碍服务执行手势
            service.performGesture(gesture, callback)
        } else {
            // 服务未开启
            callback.onCancelled(gesture)
        }
    }
}
