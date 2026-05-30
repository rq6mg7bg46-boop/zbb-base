package com.zbb.automation

import android.graphics.Rect
import android.util.Log

/**
 * OCR 识别结果
 */
data class OcrResult(
    val text: String,
    val confidence: Float,
    val boundingBox: Rect
)
