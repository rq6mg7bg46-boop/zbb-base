# ScreenshotTest - 截图测试工具

独立的 Android 截图测试项目，用于验证 MediaProjection API 截图、OCR 识别和无障碍服务自动化功能。

## 功能特性

1. **MediaProjection 截图**：截取 1080p 分辨率的屏幕截图
2. **Google ML Kit OCR**：识别图片中的中文文字，支持文字定位
3. **无障碍服务自动化**：通过 AccessibilityService 执行点击、滑动等操作
4. **悬浮窗截图**：显示悬浮按钮，点击即可截图并自动 OCR 识别

## 使用方法

### 1. 授权必要权限

#### 1.1 截图权限
1. 打开 APP
2. 点击 "请求截图权限"
3. 在弹框中选择 "开始录制"

#### 1.2 悬浮窗权限
1. 在 APP 中点击 "开启悬浮窗"
2. 在系统弹框中选择 "允许"

#### 1.3 无障碍服务（可选，用于自动点击）
1. 设置 -> 无障碍 -> 已安装的应用 -> ScreenshotTest
2. 开启服务

### 2. 使用悬浮窗截图（推荐）

1. 点击 "开启悬浮窗"
2. APP 会在屏幕右上角显示一个 **紫色圆形按钮**
3. 切换到任何 APP（如微信）
4. 点击悬浮按钮 → 立即截图 → 自动 OCR 识别
5. 重新打开测试 APP 查看识别结果

### 3. 传统截图方式

1. 确保在目标 APP 界面
2. 点击 "截图" 按钮
3. 查看识别结果

## 悬浮窗功能说明

### 悬浮按钮操作
- **点击**：立即截图 + OCR 识别
- **拖动**：移动悬浮按钮位置

### 工作流程
```
点击悬浮按钮
    ↓
隐藏悬浮窗（防止遮挡）
    ↓
截取当前屏幕
    ↓
保存到相册
    ↓
执行 OCR 识别
    ↓
显示识别结果
    ↓
恢复悬浮窗显示
```

## 项目结构

```
ScreenshotTest/
├── app/
│   ├── src/main/
│   │   ├── java/com/zbb/screenshot/
│   │   │   ├── MainActivity.kt              # 主界面
│   │   │   ├── ScreenshotHelper.kt         # 截图核心类 (1080p)
│   │   │   ├── OcrHelper.kt               # OCR 识别类 (ML Kit)
│   │   │   ├── FloatingWindowService.kt   # 悬浮窗服务
│   │   │   ├── AutomationHelper.kt        # 自动化辅助类
│   │   │   └── AutomationAccessibilityService.kt  # 无障碍服务
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   │   ├── activity_main.xml
│   │   │   │   └── layout_floating_button.xml  # 悬浮按钮布局
│   │   │   └── drawable/
│   │   │       ├── bg_floating_button.xml  # 悬浮按钮背景
│   │   │       └── ic_camera.xml           # 相机图标
│   │   └── AndroidManifest.xml
│   └── build.gradle
├── build.gradle
└── gradle/wrapper/
```

## 关键实现说明

### 截图分辨率优化
- 修复了 pixelStride/rowStride 处理，防止截图花屏
- 宽度固定 1080px，高度按比例计算
- 移除了 FLAG_SECURE，允许截取其他 APP

### 悬浮窗实现
- 使用 TYPE_APPLICATION_OVERLAY（API 26+）
- 支持拖动定位
- 截图时自动隐藏，避免遮挡

### OCR 文字定位
ML Kit 返回的文字块包含边界框信息：
```kotlin
val blocks = result.textBlocks
for (block in blocks) {
    for (line in block.lines) {
        for (element in line.elements) {
            val boundingBox = element.boundingBox
            // 计算中心点坐标
            val centerX = boundingBox.centerX()
            val centerY = boundingBox.centerY()
        }
    }
}
```

## 调试日志

使用 adb 查看日志：
```bash
# 查看所有相关日志
adb logcat -s ScreenshotHelper MainActivity OcrHelper FloatingWindow

# 查看 OCR 详细日志
adb logcat -s OcrHelper:V *:S

# 实时过滤 OCR 结果
adb logcat | grep -E "(OcrHelper|文字识别成功|找到匹配|中心坐标)"
```

日志关键词：
- `ScreenshotHelper` - 截图相关日志
- `MainActivity` - 主界面日志
- `OcrHelper` - OCR 识别日志
- `FloatingWindow` - 悬浮窗日志

## 截图文件位置

截图成功后，会同时保存到两个位置：

1. **应用私有目录**（需要 root 或通过 adb）：
   ```
   /data/data/com.zbb.screenshot/files/debug_screenshot_*.png
   ```

2. **相册目录**：
   ```
   Pictures/screenshot_*.png
   ```

查看私有目录的截图：
```bash
adb shell
run-as com.zbb.screenshot
ls files/
exit
adb pull /data/data/com.zbb.screenshot/files/debug_screenshot_*.png
```

## 常见问题

### Q: 悬浮窗按钮不显示？

A: 检查以下项：
1. 是否授权了悬浮窗权限（SYSTEM_ALERT_WINDOW）
2. 按钮可能被拖动到屏幕边缘，尝试从屏幕右上角往左拖动

### Q: 截图模糊或花屏？

A: 已修复 pixelStride 处理。如果仍有问题：
- 设备屏幕分辨率本身较低
- 检查截图分辨率设置

### Q: OCR 识别不准？

A: 提高识别精度的方法：
1. 确保截图分辨率足够高
2. 确保截图清晰，无运动模糊
3. 文字颜色与背景对比度足够高

### Q: 点击位置有偏差？

A: 可能的原因：
1. 截图分辨率与实际屏幕分辨率不匹配
2. 状态栏/导航栏高度计算问题

## OCR 错别字问题

ML Kit 中文识别可能产生少量错别字。可选解决方案：
- **方案A**：使用 PaddleOCR（识别更准，但模型大）
- **方案B**：后处理纠错（常见错字映射表）

## 集成到主项目

测试验证成功后，将以下文件复制到主项目：

| 文件 | 功能 |
|------|------|
| `ScreenshotHelper.kt` | 1080p 截图 |
| `OcrHelper.kt` | 中文 OCR 识别 |
| `FloatingWindowService.kt` | 悬浮窗截图 |
| `AutomationAccessibilityService.kt` | 无障碍服务 |

并确保在 `AndroidManifest.xml` 中注册服务和声明权限。
