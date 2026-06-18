package com.zbb.automation

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * 千机通知监听服务（方案 1：NotificationListenerService）
 *
 * 用途：
 * - 监听千机（com.lianjia.anchang）的通知栏消息
 * - 解析通知内容（标题/正文/子标题/时间戳）
 * - 通过 AutomationModule.sendEventToJS 发送 "QianjiMessageReceived" 事件给 JS 层
 *
 * 双保险机制：
 * - 方案 1（本服务）：NotificationListenerService，信息最完整
 * - 方案 2（AccessibilityServiceImpl.TYPE_NOTIFICATION_STATE_CHANGED）：兜底
 *
 * 权限：需要用户手动授权（设置 → 通知使用权 → ZBB）
 */
class NotificationMonitorService : NotificationListenerService() {

    companion object {
        private const val TAG = "NotificationMonitor"
        private const val QIANJI_PACKAGE = "com.lianjia.anchang"
        private const val EVENT_NAME = "QianjiMessageReceived"
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, ">>> 通知监听服务已连接")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        // 只处理千机包名的通知
        if (sbn.packageName != QIANJI_PACKAGE) return

        val notification: Notification = sbn.notification ?: return
        val extras: Bundle = notification.extras ?: Bundle()

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

        Log.d(TAG, "千机通知: pkg=${sbn.packageName}, title='$title', text='$text', subText='$subText'")

        emitQianjiMessage(
            pkg = sbn.packageName,
            title = title,
            text = text,
            subText = subText,
            bigText = bigText,
            timestamp = sbn.postTime
        )
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
        // 不处理通知移除事件
    }

    /**
     * 发送千机消息事件到 JS 层
     * 通过 AutomationModuleManager 单例拿到 AutomationModule 实例
     */
    private fun emitQianjiMessage(
        pkg: String,
        title: String,
        text: String,
        subText: String,
        bigText: String,
        timestamp: Long
    ) {
        try {
            val module = AutomationModuleManager.getModule() ?: run {
                Log.w(TAG, "AutomationModule 未注册，跳过事件发送（RN 可能未启动）")
                return
            }
            val payload = com.facebook.react.bridge.Arguments.createMap().apply {
                putString("package", pkg)
                putString("title", title)
                putString("text", text)
                putString("subText", subText)
                putString("bigText", bigText)
                putDouble("timestamp", timestamp.toDouble())
                putString("source", "notification")  // 标记来源（与 accessibility 区分）
            }
            module.sendEventToJS(EVENT_NAME, payload)
            Log.d(TAG, "已发送 $EVENT_NAME 事件到 JS")
        } catch (e: Exception) {
            Log.e(TAG, "发送事件失败: ${e.message}", e)
        }
    }
}