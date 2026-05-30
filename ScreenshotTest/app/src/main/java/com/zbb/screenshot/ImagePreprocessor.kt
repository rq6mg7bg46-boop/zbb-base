package com.zbb.screenshot

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Matrix
import kotlin.math.max
import kotlin.math.min

/**
 * 图像预处理工具类
 * 用于提升 OCR 识别精度，特别是中文识别
 *
 * 预处理流程：
 * 1. 缩放到合适尺寸（避免过大导致识别慢）
 * 2. 灰度化
 * 3. 对比度增强
 * 4. 锐化
 * 5. 可选：二值化（对某些场景有效）
 */
object ImagePreprocessor {

    /**
     * 预处理图片，提升 OCR 识别率
     * @param bitmap 输入的原始截图
     * @param enhanceContrast 是否增强对比度（推荐开启）
     * @param sharpen 是否锐化（推荐开启）
     * @return 预处理后的图片
     */
    fun preprocess(
        bitmap: Bitmap,
        enhanceContrast: Boolean = true,
        sharpen: Boolean = true
    ): Bitmap {
        var result = bitmap.copy(Bitmap.Config.ARGB_8888, true)

        // 1. 缩放到合适尺寸（推荐 1920x1080 以内）
        result = scaleDownIfNeeded(result, 1920)

        // 2. 灰度化
        result = toGrayscale(result)

        // 3. 增强对比度
        if (enhanceContrast) {
            result = enhanceContrast(result, 1.5f)  // 对比度增强 1.5 倍
        }

        // 4. 锐化
        if (sharpen) {
            result = sharpen(result, 0.5f)
        }

        // 5. 可选：去噪（简单的高斯模糊反转实现）
        // result = denoise(result)

        return result
    }

    /**
     * 深度预处理（适用于低对比度截图）
     */
    fun deepPreprocess(bitmap: Bitmap): Bitmap {
        var result = bitmap.copy(Bitmap.Config.ARGB_8888, true)

        // 1. 缩放
        result = scaleDownIfNeeded(result, 1920)

        // 2. 灰度化
        result = toGrayscale(result)

        // 3. 强力对比度增强
        result = enhanceContrast(result, 2.0f)

        // 4. 自适应亮度调整
        result = adjustBrightness(result, 10f)

        // 5. 强力锐化
        result = sharpen(result, 0.7f)

        // 6. 二值化（Otsu's method 简化版）
        result = autoThreshold(result)

        return result
    }

    /**
     * 如果图片过大，缩放到合适尺寸
     */
    private fun scaleDownIfNeeded(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        if (width <= maxDimension && height <= maxDimension) {
            return bitmap
        }

        val scale = maxDimension.toFloat() / max(width, height)
        val newWidth = (width * scale).toInt()
        val newHeight = (height * scale).toInt()

        val matrix = Matrix()
        matrix.postScale(scale, scale)

        return Bitmap.createBitmap(bitmap, 0, 0, width, height, matrix, true)
    }

    /**
     * 转换为灰度图
     * 使用加权平均法，更符合人眼感知
     */
    private fun toGrayscale(bitmap: Bitmap): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        val paint = Paint()

        // 使用 BT.601 标准转换（更适合 OCR）
        val colorMatrix = ColorMatrix().apply {
            setSaturation(0f)  // 完全去饱和
        }

        // 可选：添加轻微的暖色调，增强中文笔画
        val contrastMatrix = ColorMatrix(floatArrayOf(
            1.1f, 0f, 0f, 0f, 0f,
            0f, 1.1f, 0f, 0f, 0f,
            0f, 0f, 1.0f, 0f, 0f,
            0f, 0f, 0f, 1f, 0f
        ))
        colorMatrix.postConcat(contrastMatrix)

        paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
        canvas.drawBitmap(bitmap, 0f, 0f, paint)

        return result
    }

    /**
     * 增强对比度
     * @param bitmap 输入图片
     * @param contrast 对比度系数（1.0 = 原图，>1.0 = 增强，<1.0 = 减弱）
     */
    private fun enhanceContrast(bitmap: Bitmap, contrast: Float): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        val paint = Paint()

        val scale = contrast
        val translate = (-.5f * scale + .5f) * 255f

        val colorMatrix = ColorMatrix(floatArrayOf(
            scale, 0f, 0f, 0f, translate,
            0f, scale, 0f, 0f, translate,
            0f, 0f, scale, 0f, translate,
            0f, 0f, 0f, 1f, 0f
        ))

        paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
        canvas.drawBitmap(bitmap, 0f, 0f, paint)

        return result
    }

    /**
     * 锐化图像
     * 使用卷积核增强边缘，使文字笔画更清晰
     */
    private fun sharpen(bitmap: Bitmap, strength: Float): Bitmap {
        // 拉普拉斯锐化核
        val kernel = floatArrayOf(
            0f, -strength, 0f,
            -strength, 1f + 4f * strength, -strength,
            0f, -strength, 0f
        )

        return convolve3x3(bitmap, kernel)
    }

    /**
     * 3x3 卷积操作
     */
    private fun convolve3x3(bitmap: Bitmap, kernel: FloatArray): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        val result = IntArray(width * height)

        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                var r = 0f
                var g = 0f
                var b = 0f

                var kernelIndex = 0
                for (ky in -1..1) {
                    for (kx in -1..1) {
                        val pixel = pixels[(y + ky) * width + (x + kx)]
                        val kr = (pixel shr 16) and 0xFF
                        val kg = (pixel shr 8) and 0xFF
                        val kb = pixel and 0xFF

                        r += kr * kernel[kernelIndex]
                        g += kg * kernel[kernelIndex]
                        b += kb * kernel[kernelIndex]
                        kernelIndex++
                    }
                }

                result[y * width + x] = (
                    0xFF shl 24) or
                    (clamp(r.toInt()) shl 16) or
                    (clamp(g.toInt()) shl 8) or
                    clamp(b.toInt())
            }
        }

        // 复制边缘像素
        for (x in 0 until width) {
            result[x] = pixels[x]
            result[(height - 1) * width + x] = pixels[(height - 1) * width + x]
        }
        for (y in 0 until height) {
            result[y * width] = pixels[y * width]
            result[y * width + width - 1] = pixels[y * width + width - 1]
        }

        val resultBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        resultBitmap.setPixels(result, 0, width, 0, 0, width, height)
        return resultBitmap
    }

    /**
     * 调整亮度
     * @param brightness 值范围 -255 到 255
     */
    private fun adjustBrightness(bitmap: Bitmap, brightness: Float): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        val paint = Paint()

        val colorMatrix = ColorMatrix(floatArrayOf(
            1f, 0f, 0f, 0f, brightness,
            0f, 1f, 0f, 0f, brightness,
            0f, 0f, 1f, 0f, brightness,
            0f, 0f, 0f, 1f, 0f
        ))

        paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
        canvas.drawBitmap(bitmap, 0f, 0f, paint)

        return result
    }

    /**
     * 自动阈值二值化（简化版 Otsu's method）
     */
    private fun autoThreshold(bitmap: Bitmap): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        // 计算直方图
        val histogram = IntArray(256)
        for (pixel in pixels) {
            val gray = pixel and 0xFF
            histogram[gray]++
        }

        // 计算最佳阈值（简化版）
        val total = width * height
        var sum = 0L
        for (i in 0..255) {
            sum += i * histogram[i]
        }

        var sumB = 0L
        var wB = 0
        var maxVariance = 0f
        var threshold = 128

        for (t in 0..255) {
            wB += histogram[t]
            if (wB == 0) continue

            val wF = total - wB
            if (wF == 0) break

            sumB += t * histogram[t]

            val mB = sumB.toFloat() / wB
            val mF = (sum - sumB).toFloat() / wF

            val variance = wB.toFloat() * wF.toFloat() * (mB - mF) * (mB - mF)
            if (variance > maxVariance) {
                maxVariance = variance
                threshold = t
            }
        }

        // 应用阈值
        val result = IntArray(width * height)
        for (i in pixels.indices) {
            val gray = pixels[i] and 0xFF
            val newValue = if (gray > threshold) 255 else 0
            result[i] = (0xFF shl 24) or (newValue shl 16) or (newValue shl 8) or newValue
        }

        val resultBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        resultBitmap.setPixels(result, 0, width, 0, 0, width, height)
        return resultBitmap
    }

    /**
     * 值钳制到 0-255 范围
     */
    private fun clamp(value: Int): Int {
        return max(0, min(255, value))
    }

    /**
     * 水平倾斜校正（可选）
     * 当截图文字歪斜时使用
     */
    fun deskew(bitmap: Bitmap): Bitmap {
        // 简化实现，实际需要霍夫变换检测直线
        // 这里返回原图，仅作为占位
        return bitmap
    }
}
