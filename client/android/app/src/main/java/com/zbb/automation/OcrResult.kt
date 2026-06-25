/**
 * @deprecated 2026-06-25 — OCR 整套服务已删除
 *
 * 历史：
 *   - 此服务原为 ZBB 提供 OCR 文字识别能力（基于 ML Kit + Tesseract）
 *   - 全套 0 个调用方：grep recognizeScreen/recognizeTextWithPosition/OCRService 全部 0 命中
 *   - 千机(QianjiService) + 保利(BaoliService) 走节点树定位填表，根本不 OCR
 *
 * 删除范围（10 文件）：
 *   - Native: OcrHelper.kt / OcrResult.kt / OcrErrorCorrector.kt / LegacyOcrResult 类 / 10 个 OCR 方法 / ML Kit imports
 *   - AutomationModule.kt: screenContainsText / findTextByMLKit / findTextByMLKitWithPermission / recognizeTextWithPosition / screenshotAndMark / ocrLatestScreenshot（OCR 依赖）
 *   - JS: OCRService.ts / utils/ocr-examples.ts / native 4 个 OCR 包装 / ZBBAutomation 接口
 *
 * 还原方法：
 *   git log -- android/app/src/main/java/com/zbb/automation/OcrHelper.kt
 *   git checkout <commit-hash> -- <files>
 */
package com.zbb.automation
