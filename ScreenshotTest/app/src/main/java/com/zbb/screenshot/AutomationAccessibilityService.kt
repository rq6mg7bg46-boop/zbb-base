package com.zbb.screenshot

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.graphics.Rect
import android.util.Log

/**
 * 自动化无障碍服务
 * 用于执行手势操作（点击、滑动等）
 */
class AutomationAccessibilityService : AccessibilityService() {

    private val TAG = "AutomationService"

    companion object {
        var instance: AutomationAccessibilityService? = null
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "无障碍服务已创建")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "无障碍服务已销毁")
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "无障碍服务已连接")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 可以在这里处理各种无障碍事件
    }

    override fun onInterrupt() {
        Log.d(TAG, "无障碍服务被中断")
    }

    /**
     * 执行手势
     */
    fun performGesture(gesture: GestureDescription, callback: GestureResultCallback?) {
        Log.d(TAG, "执行手势")
        dispatchGesture(gesture, callback, null)
    }

    /**
     * 点击坐标
     */
    fun click(x: Float, y: Float, callback: GestureResultCallback?) {
        val path = android.graphics.Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()

        dispatchGesture(gesture, callback, null)
    }

    /**
     * 双击坐标
     */
    fun doubleClick(x: Float, y: Float, callback: GestureResultCallback?) {
        val path = android.graphics.Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
            .addStroke(GestureDescription.StrokeDescription(path, 100, 50))
            .build()

        dispatchGesture(gesture, callback, null)
    }

    /**
     * 长按坐标
     */
    fun longClick(x: Float, y: Float, duration: Long = 1000L, callback: GestureResultCallback?) {
        val path = android.graphics.Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()

        dispatchGesture(gesture, callback, null)
    }

    /**
     * 滑动操作
     */
    fun swipe(
        startX: Float, startY: Float,
        endX: Float, endY: Float,
        duration: Long = 300L,
        callback: GestureResultCallback?
    ) {
        val path = android.graphics.Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()

        dispatchGesture(gesture, callback, null)
    }

    /**
     * 查找并点击包含指定文本的元素
     */
    fun clickByText(text: String, callback: GestureResultCallback?): Boolean {
        val rootNode = rootInActiveWindow ?: return false

        val nodes = rootNode.findAccessibilityNodeInfosByText(text)
        if (nodes.isNotEmpty()) {
            val node = nodes[0]
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            
            val centerX = bounds.centerX().toFloat()
            val centerY = bounds.centerY().toFloat()
            
            Log.d(TAG, "找到文本 '$text'，点击坐标: ($centerX, $centerY)")
            
            node.recycle()
            rootNode.recycle()
            
            click(centerX, centerY, callback)
            return true
        }
        
        rootNode.recycle()
        return false
    }

    /**
     * 获取根节点
     */
    fun getRootNode(): AccessibilityNodeInfo? {
        return rootInActiveWindow
    }
}
