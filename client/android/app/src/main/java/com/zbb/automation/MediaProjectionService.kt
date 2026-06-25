/**
 * @deprecated 2026-06-25 — 前台保活服务已删除
 *
 * 历史：
 *   - 此服务原本为 ZBB 提供"前台保活 + 配合 AccessibilityService"功能。
 *   - 类注释原话：「MediaProjection 相关的功能已移至 ScreenshotService」
 *   - 即此服务早期持有 MediaProjection 实体，后迁移到 ScreenshotService 后只做冗余保活。
 *
 * 删除原因：
 *   - 类名误导（"MediaProjectionService" 但实际无 MediaProjection 实体），Android 14+ 会警告
 *   - ScreenshotService 自己持有 MediaProjection 合规保活
 *   - AccessibilityService 自身也是 mediaProjection 类型前台 Service
 *   - 双保活点足够，删一个不影响功能
 *
 * 删的连带改动（AccessibilityServiceImpl.kt）：
 *   - startForegroundServiceForMediaProjection() → 重命名为 startScreenshotForegroundService()
 *   - 函数体里删 MediaProjectionService.startService(this) 调用
 *   - 保留 ScreenshotService.startService(this) 单独承担前台保活
 *
 * AndroidManifest.xml 同步删除 <service android:name=".MediaProjectionService" .../> 声明
 *
 * 还原方法（如需恢复）：
 *   git log -- android/app/src/main/java/com/zbb/automation/MediaProjectionService.kt
 *   git checkout <commit-hash> -- android/app/src/main/java/com/zbb/automation/MediaProjectionService.kt
 *   git checkout <commit-hash> -- android/app/src/main/AndroidManifest.xml
 *   git checkout <commit-hash> -- android/app/src/main/java/com/zbb/automation/AccessibilityServiceImpl.kt
 */
package com.zbb.automation
