# ZBB 开发环境与问题解决

> ZBB 自动化报备系统 - 开发环境配置、遇到的问题及解决方案

---

## 一、环境配置

### 1.1 基础环境

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js | v20.20.1 | JavaScript 运行时 |
| pnpm | 9.0.0 | 包管理器 |
| JDK | 17+ | Android 编译需要 |
| Android SDK | API 36 | 编译目标版本 |
| Gradle | 8.14.3 | Android 构建工具 |

### 1.2 验证命令

```powershell
# 检查 Node.js 版本
node -v
# 输出: v20.20.1

# 检查 pnpm 版本
pnpm -v
# 输出: 9.0.0
```

### 1.3 项目初始化

```bash
# 进入项目目录
cd /workspace/projects

# 使用模板初始化（如果需要）
coze init --template expo

# 安装依赖
pnpm install
```

---

## 二、Android 编译

### 2.1 Debug APK 编译

```powershell
cd client/android

# 清理缓存
.\gradlew clean

# 删除构建产物
Remove-Item -Recurse -Force app\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .gradle -ErrorAction SilentlyContinue

# 编译 Debug APK
.\gradlew assembleDebug
```

### 2.2 编译产物位置

```
client/android/app/build/outputs/apk/debug/
└── app-debug.apk
```

### 2.3 Metro 开发服务器

```powershell
cd client

# 启动 Metro（清理缓存模式）
npx expo start --clear

# 或使用
npx expo start --reset-cache
```

---

## 三、常见问题与解决方案

### 3.1 Metro 启动失败

**问题**：
```
Metro waiting on http://localhost:8081
但端口测试 TcpTestSucceeded: False
```

**根因**：Metro 初始化时文件监听失败

**解决方案**：
1. 创建 `.watchmanconfig` 文件
```powershell
cd client
"{}" | Out-File -FilePath .watchmanconfig -Encoding utf8
```

2. 创建空 `node_modules` 目录
```powershell
mkdir E:\App\ZBB\projects\node_modules
```

3. 重启 Metro
```powershell
npx expo start --clear
```

---

### 3.2 PowerShell 语法错误

**问题**：
```
echo : 无法将"echo."项识别为 cmdlet
```

**原因**：PowerShell 中 `echo.` 语法不正确

**解决方案**：
```powershell
# 错误写法
echo . > file.txt
rmdir /s /q dir 2>nul

# 正确写法
"{}" | Out-File -FilePath file.txt -Encoding utf8
Remove-Item -Recurse -Force dir -ErrorAction SilentlyContinue
```

---

### 3.3 模块解析错误

**问题**：
```
Unable to resolve '@/screens/logs' from 'client\app\logs.tsx'
```

**根因**：
- `client/screens/logs/index.tsx` 文件不存在
- Metro 缓存导致路径解析失败

**解决方案**：
1. 确保文件存在
```bash
dir client\screens\logs
```

2. 清理 Metro 缓存
```powershell
npx expo start --clear
# 或按 r 键刷新
```

---

### 3.4 节点树解析找不到元素

**问题**：`findElementByText` 返回 `found: false`

**日志分析**：
```
[findNodeByText] rootInActiveWindow 为空
[findNodeByText] 找到 0 个节点
```

**根因**：
1. 调用时节点还没渲染完成
2. `rootInActiveWindow` 获取失败
3. 查找的是 `text` 属性，但实际文字在 `contentDescription` 中

**解决方案**：

#### 方案A：使用固定坐标（已采用）
```typescript
// 步骤2: 点击消息
const CLICK_X = 750;
const CLICK_Y = 2300;
await zbbAutomation.click(CLICK_X, CLICK_Y);

// 步骤3: 查找好友
const CLICK_X = 340;
const CLICK_Y = 370;
await zbbAutomation.click(CLICK_X, CLICK_Y);
```

#### 方案B：添加重试机制
```typescript
async function findElementByTextWithRetry(
  text: string,
  maxRetries: number = 3,
  retryDelay: number = 1500
): Promise<any | null> {
  for (let i = 0; i < maxRetries; i++) {
    const result = await zbbAutomation.findElementByText(text);
    if (result?.found) {
      const centerX = result.boundsCenterX || result.bounds?.centerX;
      const centerY = result.boundsCenterY || result.bounds?.centerY;
      if (centerX > 0 && centerY > 0) {
        return result;
      }
    }
    if (i < maxRetries - 1) {
      await zbbAutomation.delay(retryDelay);
    }
  }
  return null;
}
```

---

### 3.5 dumpWindowTreeString 返回格式不完整

**问题**：`dumpWindowTreeString()` 返回的节点树没有文字内容

**日志**：
```
========== 窗口节点树 ==========
[FrameLayout] enabled bounds=Rect(0, 0 - 1080, 2400)
  [LinearLayout] enabled bounds=Rect(0, 0 - 1080, 2400)
    ...
================================
共找到 0 个按钮
```

**根因**：`dumpWindowTreeString()` 返回的是简化格式，不包含 `text` 和 `contentDescription` 属性

**解决方案**：改用 Kotlin 原生 `findAccessibilityNodeInfosByText()` 方法

---

### 3.6 APk 未更新问题

**问题**：修改代码后 APP 运行的是旧版本

**排查步骤**：
1. 确认文件已修改
```bash
grep -n "固定坐标" client/services/NativeAutomationService.ts
```

2. 清理并重新编译
```powershell
cd client/android
.\gradlew clean
.\gradlew assembleDebug
```

3. 卸载旧 APK，重新安装

---

### 3.7 AccessibilityService 未注册

**问题**：应用无法启动，报错服务未注册

**检查 AndroidManifest.xml**：
```xml
<service
    android:name=".automation.AccessibilityServiceImpl"
    android:exported="false"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
    <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService" />
    </intent-filter>
    <meta-data
        android:name="android.accessibilityservice"
        android:resource="@xml/accessibility_service_config" />
</service>
```

**检查 MainApplication.kt**：
```kotlin
override fun getPackages(): List<ReactPackage> {
    return PackageList(this).packages.apply {
        add(AutomationPackage())
    }
}
```

---

### 3.8 无障碍服务手势权限缺失 ⭐ 重要

**问题**：`click()` 方法日志显示"点击成功"，但实际未点击

**症状**：
- JS 层日志：`点击成功` / `✓ 点击成功`
- Kotlin 层日志：`dispatchGesture completed: true`
- 但实际没有执行点击，界面无反应

**排查过程**：
1. 检查 `click()` 方法实现 → 代码正确
2. 检查 `dispatchGesture()` 返回值 → 返回 true
3. 检查 Logcat 过滤 `AccessibilityServiceImpl` → 无错误
4. **最终发现**：`accessibility_service_config.xml` 缺少 `canPerformGestures="true"`

**根因**：
```
accessibility_service_config.xml 中缺少关键配置：
android:canPerformGestures="true"

没有此配置，AccessibilityService 没有权限模拟触摸事件，
dispatchGesture() 永远无法真正执行手势。
```

**错误配置示例**：
```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="..."
    android:canRetrieveWindowContent="true"
    <!-- ↑ 缺少 canPerformGestures="true" -->
    android:description="@string/..."
/>
```

**正确配置**：
```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="..."
    android:canPerformGestures="true"      <!-- ← 必须添加 -->
    android:canRetrieveWindowContent="true"
    android:description="@string/..."
/>
```

**经验教训**：

| 项目 | 说明 |
|------|------|
| **教训** | 配置文件的每一个属性都可能是关键，不能想当然 |
| **排查思路** | 代码逻辑正确 → 检查运行环境配置 → 检查服务权限配置 |
| **调试方法** | 不能只信日志返回值，要验证实际效果 |

**禁止事项**：
- ❌ 不能省略 `canPerformGestures="true"` 配置
- ❌ 不能省略 `canRetrieveWindowContent="true"` 配置
- ❌ 不能省略 `android:accessibilityEventTypes="typeAllMask"` 配置

---

### 3.9 OCR 截图路径问题 ⭐

**问题**：ML Kit OCR 识别失败，`FileNotFoundException`

**症状**：
```
[OCR] 识别图片: /data/user/0/com.zbb.automation/files/zbb_screenshot_xxx.png
[OCR] 识别失败: FileNotFoundException: No content provider: ...
```

**根因**：
截图保存到手机**私有目录** (`/data/user/0/com.zbb.automation/files/`)，ML Kit OCR 服务无法访问。
Android 10+ 即使保存到 Download 目录，其他 App 也无法直接访问文件路径。

```
手机内部存储
├── /data/user/0/com.zbb.automation/files/  ← 私有目录，只有 App 能访问
│   └── zbb_screenshot_xxx.png              ❌ OCR 无法读取
└── /storage/emulated/0/Download/           ← 外部存储
    └── zbb_screenshot_xxx.png              ❌ Android 10+ 仍无法读取
```

**最终解决方案：使用 base64 方式（推荐）**

Android 端提供 `takeScreenshotBase64()` 方法，直接返回 base64 编码的截图，前端无需访问文件路径。

```typescript
// 步骤5 长按消息 - 使用 base64 方式截图
const screenshotBase64 = await zbbAutomation.takeScreenshotBase64();
if (screenshotBase64) {
  // 直接传给 OCR 识别
  const ocrResults = await ocrService.recognizeTextFromBase64(screenshotBase64);
}
```

**修改文件**：
1. `OCRService.ts` - 添加 `recognizeTextFromBase64()` 方法
2. `NativeAutomationService.ts` - 步骤5优先使用 base64 截图

**实现代码**：

```typescript
// OCRService.ts
async recognizeTextFromBase64(base64Image: string, useChinese: boolean = true): Promise<OCRResult[]> {
  try {
    // 构建 base64 数据 URI
    const imageUri = `data:image/png;base64,${base64Image}`;
    const script = useChinese ? TextRecognitionScript.CHINESE : TextRecognitionScript.LATIN;
    const result = await TextRecognition.recognize(imageUri, script);
    // ... 处理结果
  } catch (error) {
    console.error('[OCR] base64 识别失败:', error);
    return [];
  }
}
```

**备选方案**：复用 AccessibilityService 内部 OCR

从 Logcat 日志发现 AccessibilityService 内部有自己的 OCR 实现，但 ML Kit 报错：
```
AccessibilityServiceImpl: Node OCR 识别到 64 个文字节点  ✅
MLKitImageUtils: FileNotFoundException                            ❌
```

如需深入优化，可考虑在 Kotlin 层直接使用 ML Kit（不通过文件路径）。

---

### 3.10 OCR 识别结果过滤问题

**问题**：OCR 识别到文字，但过滤后只剩 2 个

**症状**：
```
[OCR] 识别图片: ...
[OCR] 识别到 2 个文字
[ZBB WARN] 未找到消息候选，使用默认 Y=2050
```

**根因**：
1. 过滤条件太严格（必须包含手机号或称呼）
2. Android 10+ 文件访问限制导致截图可能不完整

**解决方案**：

#### 1. 放宽过滤条件

```typescript
// 在 NativeAutomationService.ts 步骤5中
// 只要在消息区域内，且不是干扰项，就可以作为候选
if (centerY < 500 || centerY > 2200) continue;  // 消息区域
if (centerX > 600) continue;  // 左侧消息
if (this.isInterferenceText(text)) continue;  // 排除干扰项

// 只要是中文文字块，就可以作为候选（不需要必须包含手机号）
const isChineseText = /[\u4e00-\u9fa5]/.test(text);
if (isChineseText && text.length >= 2) {
  messageCandidates.push({ text, x: centerX, y: centerY });
}
```

#### 2. 添加完整日志输出

```typescript
// 调试：输出所有识别结果
logToBoth('info', '[抖音：步骤5] === OCR 识别详情 ===');
ocrResults.forEach((item, index) => {
  if (item.text && item.bounds) {
    logToBoth('info', `[抖音：步骤5] ${index + 1}. "${item.text}" at (${item.bounds.x}, ${item.bounds.y})`);
  }
});
```

**注意**：使用 base64 方式后，截图读取问题已解决，OCR 识别准确率应大幅提升。

---

### 3.11 findElementByText 返回值字段名问题

**问题**：`findElementByText` 返回的坐标字段名与前端预期不符

**症状**：
```
[企业微信测试] findElementByText 返回: found=true, x=undefined, y=undefined
```

**根因**：Kotlin 层返回的字段名是 `centerX`/`centerY`，前端代码使用了错误的字段名 `boundsCenterX`/`boundsCenterY`

**Kotlin 返回格式**：
```kotlin
map.putDouble("centerX", centerX)
map.putDouble("centerY", centerY)
```

**前端错误写法**：
```typescript
const result = await zbbAutomation.findElementByText('工作台');
result.boundsCenterX  // ❌ 错误：undefined
result.boundsCenterY  // ❌ 错误：undefined
```

**前端正确写法**：
```typescript
const result = await zbbAutomation.findElementByText('工作台');
result.centerX  // ✅ 正确
result.centerY  // ✅ 正确
```

**崩溃原因**：
```
NativeArgumentsParseException: null cannot be cast to non-null type kotlin.Double
```
用 `undefined` 调用 `click(x, y)` 导致类型转换崩溃。

---

### 3.12 native/index.ts 缺少 getAllTextNodes 方法

**问题**：`getAllTextNodes` 方法在 Kotlin 层已实现，但前端调用时报错：
```
TypeError: _native.zbbAutomation.getAllTextNodes is not a function (it is undefined)
```

**症状**：
```
[调试] 打印失败: TypeError: _native.zbbAutomation.getAllTextNodes is not a function (it is undefined)
```

**根因**：`native/index.ts` 中的 `zbbAutomation` 对象没有添加 `getAllTextNodes` 方法，导致该方法无法被前端调用。

**排查方法**：
检查 `client/native/index.ts` 文件，确认 `zbbAutomation` 对象是否包含目标方法。

**解决方案**：
在 `native/index.ts` 的 `zbbAutomation` 对象中添加方法：
```typescript
export const zbbAutomation = NativeModules.ZBBAutomation;

zbbAutomation.getAllTextNodes = async (): Promise<{ found: boolean; text: string; centerX: number; centerY: number }[]> => {
  return new Promise((resolve, reject) => {
    NativeModules.ZBBAutomation.getAllTextNodes(
      (result: any) => resolve(result || []),
      (error: any) => reject(error)
    );
  });
};
```

---

## 四、调试方法

### 4.1 Logcat 日志过滤

```bash
# 过滤无障碍服务日志
adb logcat -s AccessibilityServiceImpl | grep -A 100 "findNodeByText"

# 过滤所有 ZBB 相关日志
adb logcat | grep "ZBB"
```

### 4.2 添加详细日志

在 Kotlin 中添加调试日志：
```kotlin
Log.d(TAG, "[findNodeByText] 开始查找: text='$text'")
Log.d(TAG, "[findNodeByText] rootNode = ${rootInActiveWindow != null}")
Log.d(TAG, "[findNodeByText] 找到 ${nodes.size} 个节点")
nodes.forEach {
    Log.d(TAG, "[节点] text=${it.text}, bounds=${it.boundsInScreen}")
}
```

### 4.3 诊断方法

在 JS 层添加诊断：
```typescript
// 导出节点树
async diagnoseDumpWindowTree(): Promise<void> {
  await zbbAutomation.dumpWindowTree();
}

// 查找所有匹配元素
async diagnoseFindElements(text: string): Promise<void> {
  const elements = await zbbAutomation.findElementsByText(text);
  elements.forEach((el, index) => {
    console.log(`[诊断] 元素${index + 1}:`, el);
  });
}
```

---

## 五、关键文件修改记录

### 5.1 新增文件

| 文件路径 | 说明 |
|----------|------|
| `android/app/src/main/java/com/zbb/automation/AccessibilityServiceImpl.kt` | 无障碍服务实现 |
| `android/app/src/main/java/com/zbb/automation/AutomationModule.kt` | React Native 桥接 |
| `android/app/src/main/java/com/zbb/automation/AutomationPackage.kt` | React Native 包注册 |
| `android/app/src/main/res/xml/accessibility_service_config.xml` | 无障碍服务配置 |
| `native/ZBBAutomation.ts` | TypeScript 原生模块封装 |
| `services/NativeAutomationService.ts` | 核心自动化服务 |
| `client/.watchmanconfig` | Metro 监听配置 |

### 5.2 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `AndroidManifest.xml` | 声明无障碍服务 |
| `MainApplication.kt` | 注册 AutomationPackage |
| `metro.config.js` | 简化为最小配置 |
| `NativeAutomationService.ts` | 添加固定坐标点击 |
| `AccessibilityServiceImpl.kt` | 添加详细日志 |

---

## 六、开发命令速查

```powershell
# ========== 开发环境 ==========
# 启动 Expo 开发服务器
cd client
npx expo start --clear

# ========== Android 编译 ==========
cd client/android
.\gradlew clean
.\gradlew assembleDebug

# ========== 调试 ==========
# 查看日志
adb logcat -s AccessibilityServiceImpl

# 过滤特定日志
adb logcat | grep "findNodeByText"
```

---

## 七、常见问题自检清单

1. **Node.js 版本**：是否为 v20.20.1
2. **端口占用**：`Test-NetConnection -ComputerName localhost -Port 8081`
3. **node_modules**：是否存在空目录
4. **.watchmanconfig**：是否存在于 `client/` 目录
5. **metro.config.js**：是否为简化版本
6. **APK**：是否重新编译后安装

---

## 更新记录

### 2025-05-08: AccessibilityService 启动第三方应用方案 ⭐

**问题**：在 ZBB App 内启动千机（`com.lianjia.anchang`）时，shell 命令失败。

**失败尝试**：
| 方法 | 命令 | 结果 | 原因 |
|------|------|------|------|
| monkey | `shell monkey -p com.lianjia.anchang ...` | exitCode 253 | 华为设备权限限制 |
| am start | `shell am start -n ...` | exitCode 255 | App 内 shell 权限不足 |

**根因**：普通 App 内的 shell 权限被华为系统限制，无法执行 `am start` 等系统命令。

**解决方案：使用 AccessibilityService 权限启动**

AccessibilityService 运行在系统进程中，拥有比普通 App 更高的权限。可以直接调用 `startActivity()` 启动任意应用的任意 Activity。

**核心代码**：

```kotlin
// AccessibilityServiceImpl.kt
fun launchAppWithAmStart(
    packageName: String, 
    mainActivityClass: String, 
    callback: ((Boolean) -> Unit)? = null
) {
    try {
        // 1. 构造目标 Activity 的 ComponentName
        val componentName = android.content.ComponentName(packageName, mainActivityClass)
        
        // 2. 创建 Intent 并设置 Component
        val intent = android.content.Intent()
        intent.setComponent(componentName)
        
        // 3. 添加 NEW_TASK 标志（启动新任务栈）
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        
        // 4. 调用 AccessibilityService 的 startActivity（关键！）
        startActivity(intent)
        
        callback?.invoke(true)
    } catch (e: Exception) {
        Log.e(TAG, "启动失败: ${e.message}")
        callback?.invoke(false)
    }
}
```

**前端调用**：

```typescript
// QianjiService.ts
import { zbbAutomation } from '@/native';

// 千机包名
const APP_PACKAGES = {
  QIANJI: 'com.lianjia.anchang',
};

// 千机主 Activity（可通过 adb 获取）
const QIANJI_MAIN_ACTIVITY = 'com.lianjia.link.platform.main.MainActivity';

// 启动千机
const launched = await zbbAutomation.launchAppWithAmStart(
  APP_PACKAGES.QIANJI,
  QIANJI_MAIN_ACTIVITY
);
```

**如何获取主 Activity**：

```bash
# 方法1：使用 dumpsys
adb shell dumpsys package com.lianjia.anchang | grep -A 1 "MainActivity"

# 方法2：查看 APK 的 AndroidManifest.xml 中的 LAUNCHER
adb shell dumpsys m activity activities | grep com.lianjia.anchang
```

**验证日志**：

启动成功时的 Logcat 输出：
```
AutomationModule: 使用 AccessibilityService 启动应用: com.lianjia.anchang
AccessibilityServiceImpl: 使用 AccessibilityService 启动应用: com.lianjia.anchang/com.lianjia.link.platform.main.MainActivity
AccessibilityServiceImpl: AccessibilityService startActivity 启动成功
```

**关键点**：
1. **不是 shell 命令**：直接调用 Android Framework API，无需 shell
2. **AccessibilityService 权限**：必须在 `accessibility_service_config.xml` 中配置
3. **FLAG_ACTIVITY_NEW_TASK**：必须添加，否则无法从非 Activity 上下文启动
4. **ComponentName**：直接指定包名和 Activity 类名，绕过 `getLaunchIntentForPackage` 返回 null 的问题

### 2025年4月27日 - 5月2日 主要更新

#### 1. 企业微信测试流程重构 (v3.0)

**核心流程**：
```
步骤0: 初始化数据库 → 写入预置客户数据
步骤1-9: 打开企微 → 点击工作台 → 点击越秀地产悦秀会 → 点击我要推荐
步骤10-11: 输入姓名/手机号（长按粘贴方案）
步骤11.5: 根据姓名自动判断性别（先生→男，女士→女）
步骤12: 验证输入内容
步骤12.5: 勾选"我已阅读并同意"
步骤13: 点击"立即推荐"
步骤14: 验证报备结果（查找"待确认"）
步骤15: 退出小程序（导航键方案）
步骤16: 打印完整数据库内容
```

**预置客户数据**：
```javascript
const presetCustomers = [
  { name: '刘先生', phone: '13213432247' },
  { name: '王女士', phone: '13213432298' },
  { name: '蔡先生', phone: '13213432324' },
  { name: '蔡先生', phone: '13213432324' },
];
```

---

#### 2. 输入方案演进

**问题**：WebView 中的 inputText (ACTION_SET_TEXT) 不被支持

**解决方案演进**：
1. ~~inputText 直接输入~~ → 失败
2. 剪贴板粘贴 → 部分有效
3. **最终方案：长按触发粘贴菜单**
```typescript
// 1. 复制到剪贴板
await zbbAutomation.pasteText('刘先生');

// 2. 点击输入框
await zbbAutomation.click(nameInputX, nameInputY);

// 3. 长按触发粘贴菜单
await zbbAutomation.longClick(nameInputX, nameInputY, 1200);

// 4. OCR 查找"粘贴"选项并点击
const pasteNode = nodes.find(n => n.text === '粘贴');
await zbbAutomation.click(pasteNode.centerX, pasteNode.centerY);
```

---

#### 3. 退出小程序方案

**问题**：小程序界面被保护，screencap 生成 0 字节文件

**解决方案：使用屏幕内导航键**
```typescript
const NAV_RECENT = { x: 300, y: 2300 };  // 多任务键
const NAV_TRASH = { x: 540, y: 2150 };    // 垃圾箱
const NAV_HOME = { x: 540, y: 2300 };     // Home键

// 1. 点击多任务键
await zbbAutomation.click(NAV_RECENT.x, NAV_RECENT.y);

// 2. 点击垃圾箱关闭应用
await zbbAutomation.click(NAV_TRASH.x, NAV_TRASH.y);

// 3. 按Home键回到桌面
await zbbAutomation.click(NAV_HOME.x, NAV_HOME.y);
```

---

#### 4. 截图功能（多种方案）

**问题**：小程序 WebView 被保护，screencap 生成 0 字节文件

**方案1：screencapShell**
```typescript
const result = await zbbAutomation.screencapShell('/sdcard/Pictures/ZBB/screenshot.png');
```

**方案2：帧缓冲截图**
```typescript
const result = await zbbAutomation.screenshotViaFrameBuffer();
```

**方案3：MediaStore API**
```typescript
const result = await zbbAutomation.screenshotViaMediaStore();
```

---

#### 5. SQLite 数据库功能

**数据库表结构**：
```sql
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_time TEXT NOT NULL,
  surname TEXT NOT NULL,
  phone TEXT NOT NULL,
  report_status TEXT DEFAULT 'pending',
  report_time TEXT,
  created_at INTEGER NOT NULL
);
```

**状态流转**：
- `pending` → 初始状态
- `success` → 报备成功（找到"待确认"）
- `failed` → 报备失败（未找到"待确认"）

---

#### 6. 数据库驱动多客户报备

**流程**：
1. 初始化数据库，写入预置客户数据
2. 循环从数据库读取待报备客户
3. 每报备一个客户后：
   - 成功 → 更新状态为 `success`
   - 失败 → 更新状态为 `failed`
   - 返回桌面（等待2-3秒随机时间）
   - 重新打开企业微信继续下一客户
4. 全部完成后打印完整数据库内容

---

#### 7. 关键文件修改

| 文件 | 修改内容 |
|------|----------|
| `services/NativeAutomationService.ts` | 核心自动化逻辑，数据库驱动 |
| `native/ZBBAutomation.ts` | 添加新方法封装 |
| `android/.../AccessibilityServiceImpl.kt` | 截图方案实现 |
| `android/.../AutomationModule.kt` | 暴露新方法 |
| `services/DatabaseService.ts` | SQLite 数据库操作 |

---

#### 8. 技术要点总结

| 问题 | 解决方案 |
|------|----------|
| WebView 无法输入 | 剪贴板粘贴 + 长按触发菜单 |
| 小程序截图失败 | 使用导航键退出，不依赖截图 |
| 多客户批量报备 | 数据库驱动，状态流转 |
| 性别自动判断 | 根据姓名后缀判断（先生/女士） |
| 退出小程序 | 导航键（多任务→垃圾箱→Home） |

---

#### 9. 典型日志输出

```
========================================
[企业微信测试] 步骤0：初始化数据库并写入预置客户数据
[企业微信测试] 步骤0：写入客户 "刘先生" (ID=1)
[企业微信测试] 步骤0：写入客户 "王女士" (ID=2)
[企业微信测试] 步骤0：共写入 4 条客户数据
========================================
[ZBB DB] 数据库记录列表:
========================================
1. [1] 2025-05-02 | 刘 | 13213432247 | success | 2025-05-02
2. [2] 2025-05-02 | 王 | 13213432298 | success | 2025-05-02
3. [3] 2025-05-02 | 蔡 | 13213432324 | failed | 2025-05-02
4. [4] 2025-05-02 | 蔡 | 13213432324 | pending | -
========================================
总计: 4 条记录
========================================
```

---

#### 10. 待优化事项

- [ ] 截图功能在企微小程序中仍不可用
- [ ] 输入框验证逻辑需要更健壮
- [ ] 考虑添加 OCR 辅助验证输入结果
- [ ] 多客户循环中的错误恢复机制
