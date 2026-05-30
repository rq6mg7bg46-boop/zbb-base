# ZBB 功能与架构文档

> ZBB 自动化报备系统 - 功能说明、项目结构与核心实现

---

## 一、项目概述

### 1.1 项目背景

ZBB（自动化报备）是一款基于 Android 无障碍服务的自动化工具，用于帮助用户自动完成抖音获客 → 微信小程序报备 → 抖音反馈的完整闭环流程。

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Expo + React Native | 移动端 UI |
| 通信层 | React Native Bridge | JS 与 Android 通信 |
| 服务层 | AccessibilityService | Android 无障碍服务 |
| 截图 | MediaProjection API | 屏幕截图 |
| OCR | Google ML Kit | 文字识别 |

---

## 二、核心功能

### 2.1 功能列表

| 功能模块 | 说明 |
|----------|------|
| **抖音自动化** | 打开抖音 → 点击消息 → 查找好友 → 长按复制客户信息 |
| **微信自动化** | 打开微信 → 搜索小程序 → 进入报备页面 |
| **小程序报备** | 输入客户信息 → 选择项目 → 提交报备 |
| **截图反馈** | 报备成功后截图 → 返回抖音发送截图 |
| **无障碍服务** | 提供点击、滑动、文本查找等底层自动化能力 |
| **悬浮窗控制** | 显示当前步骤，支持中途停止 |

### 2.2 APP 包名

```typescript
const APP_PACKAGES = {
  DOUYIN: 'com.ss.android.ugc.aweme',  // 抖音
  WECHAT: 'com.tencent.mm',            // 微信
};
```

---

## 三、执行流程（14步）

### 阶段一：抖音获取客户信息

| 步骤 | 名称 | 说明 | 坐标 |
|------|------|------|------|
| 1 | 打开抖音 | 启动抖音 APP | - |
| 2 | 点击消息 | 点击底部"消息"按钮 | (750, 2300) |
| 3 | 查找好友 | 点击好友"只如初见" | (340, 370) |
| 4 | 进入聊天 | 点击对话框进入聊天 | 节点树解析 |
| 5 | 长按消息 | 长按对方消息 | 节点树解析 |
| 6 | 点击复制 | 点击复制按钮 | 节点树解析 |
| 7 | 读取信息 | 从剪贴板读取客户信息 | - |

### 阶段二：微信报备

| 步骤 | 名称 | 说明 |
|------|------|------|
| 8 | 打开微信 | 启动微信 APP |
| 9 | 进入小程序 | 搜索并进入"新绿城云"小程序 |
| 10 | 点击我要推荐 | 点击底部按钮 |
| 11 | 输入客户信息 | 输入姓名和电话 |
| 12 | 报备项目1 | 选择"郑州春月锦庐"并提交 |
| 13 | 报备项目2 | 选择"郑州湖畔雲庐"并提交 |

### 阶段三：抖音反馈

| 步骤 | 名称 | 说明 |
|------|------|------|
| 14 | 发送截图 | 返回抖音发送报备截图 |

---

## 四、项目结构

### 4.1 目录结构

```
/workspace/projects/
├── client/                          # React Native 前端
│   ├── app/                         # Expo Router 路由
│   │   ├── _layout.tsx             # 根布局
│   │   ├── home.tsx                # 首页
│   │   └── index.tsx               # 入口
│   ├── screens/                     # 页面组件
│   │   ├── home/                   # 首页
│   │   │   └── index.tsx
│   │   ├── settings/                # 设置页
│   │   └── logs/                    # 日志页
│   ├── services/                    # 业务逻辑服务
│   │   ├── NativeAutomationService.ts  # 核心自动化服务
│   │   ├── AutomationEngine.ts      # 流程引擎
│   │   ├── CustomerTable.ts         # 客户信息表格
│   │   └── CalibrationService.ts    # 校准服务
│   ├── native/                      # 原生模块封装
│   │   ├── index.ts                 # 导出入口
│   │   └── ZBBAutomation.ts         # 原生模块 TypeScript 封装
│   ├── android/                     # Android 原生代码
│   │   └── app/src/main/
│   │       ├── java/com/zbb/automation/
│   │       │   ├── AccessibilityServiceImpl.kt  # 无障碍服务
│   │       │   ├── AutomationModule.kt         # React Native 桥接
│   │       │   ├── AutomationPackage.kt         # 包注册
│   │       │   ├── ScreenshotService.kt        # 截图服务
│   │       │   └── FloatingWindowService.kt    # 悬浮窗服务
│   │       ├── res/xml/
│   │       │   └── accessibility_service_config.xml  # 无障碍配置
│   │       └── AndroidManifest.xml              # 服务声明
│   └── package.json
├── server/                          # Express 后端（预留）
├── package.json                      # pnpm workspace 根配置
└── *.md                             # 项目文档

```

### 4.2 核心文件说明

| 文件 | 职责 | 关键类/方法 |
|------|------|-------------|
| `NativeAutomationService.ts` | 自动化流程编排 | `executeFullFlow()`, 各 `stepXxx()` 方法 |
| `AutomationModule.kt` | React Native 桥接层 | `@ReactMethod` 暴露的方法 |
| `AccessibilityServiceImpl.kt` | 无障碍服务实现 | `findNodeByTextInternal()`, `performClick()` |
| `ZBBAutomation.ts` | TypeScript 封装 | `zbbAutomation` 单例 |

---

## 五、核心类说明

### 5.1 JavaScript 层

#### NativeAutomationService
```
位置: client/services/NativeAutomationService.ts
职责: 流程编排、步骤执行、OCR 辅助

关键方法:
- executeFullFlow()         # 执行完整流程
- stepOpenDouyin()         # 步骤1: 打开抖音
- stepClickMessages()       # 步骤2: 点击消息 (固定坐标 750,2300)
- stepFindFriend()          # 步骤3: 查找好友 (固定坐标 340,370)
- stepClickChat()           # 步骤4: 进入聊天
- stepLongPressMessage()    # 步骤5: 长按消息
- stepClickCopy()           # 步骤6: 点击复制
- stepParseMessage()        # 步骤7: 解析信息
- checkScreenText()         # OCR 检测文字
- recognizeScreenText()     # OCR 识别屏幕
```

#### AutomationEngine
```
位置: client/services/AutomationEngine.ts
职责: 状态管理、日志记录、事件通知
```

#### CustomerTable
```
位置: client/services/CustomerTable.ts
职责: 客户信息存储、状态管理
```

### 5.2 Kotlin 层

#### AccessibilityServiceImpl
```
位置: android/app/src/main/java/com/zbb/automation/AccessibilityServiceImpl.kt
职责: 无障碍服务核心实现

关键方法:
- findNodeByTextInternal()     # 递归查找节点（同时匹配 text 和 contentDescription）
- findNodeByTextRecursive()    # 递归遍历子节点
- performClick()               # 执行点击手势
- performLongClick()           # 执行长按手势
- performSwipe()               # 执行滑动手势
```

#### AutomationModule
```
位置: android/app/src/main/java/com/zbb/automation/AutomationModule.kt
职责: React Native 桥接层

关键方法:
- isAccessibilityServiceRunning()  # 检查服务状态
- launchApp()                     # 启动 APP
- takeScreenshot()                # 截图
- recognizeText()                 # OCR 识别
- click()                         # 点击
- longClick()                     # 长按
- findElementByText()             # 查找元素
```

#### ScreenshotService
```
位置: android/app/src/main/java/com/zbb/automation/ScreenshotService.kt
职责: MediaProjection 截图服务
```

#### FloatingWindowService
```
位置: android/app/src/main/java/com/zbb/automation/FloatingWindowService.kt
职责: 悬浮窗显示和交互
```

---

## 六、数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React Native)                       │
│  ┌─────────────────┐    ┌──────────────────────────────────┐   │
│  │ HomeScreen      │───▶│ NativeAutomationService          │   │
│  │ (UI 界面)       │    │ - executeFullFlow()              │   │
│  │                 │    │ - 各 stepXxx() 方法              │   │
│  └─────────────────┘    └──────────────┬───────────────────┘   │
└─────────────────────────────────────────┼───────────────────────┘
                                          │ NativeModules
┌─────────────────────────────────────────┼───────────────────────┐
│                        Android (Kotlin)                         │
│  ┌──────────────────────────────────────▼────────────────────┐   │
│  │ AutomationModule (React Native Bridge)                    │   │
│  │ - @ReactMethod 暴露的方法                                 │   │
│  └─────────────────────────────┬────────────────────────────┘   │
│                                │                                 │
│  ┌─────────────────────────────▼────────────────────────────┐   │
│  │ AccessibilityServiceImpl (无障碍服务)                      │   │
│  │ - findNodeByTextInternal() (递归查找节点)                  │   │
│  │ - performClick() (执行点击)                               │   │
│  │ - performGesture() (执行手势)                             │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────┐  ┌────────────────────────────────┐   │
│  │ ScreenshotService   │  │ FloatingWindowService           │   │
│  │ (MediaProjection)   │  │ (悬浮窗)                         │   │
│  └─────────────────────┘  └────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 七、延时配置

```typescript
const DELAY_CONFIG = {
  openApp: { min: 8000, max: 10000 },  // 开APP 8-10 秒
  other: { min: 5000, max: 8000 },     // 其他操作 5-8 秒
  notice: { min: 5000, max: 5000 },    // 阅读须知 5 秒
};
```

---

## 八、关键坐标

| 位置 | X | Y | 说明 |
|------|---|---|------|
| 消息按钮 | 750 | 2300 | 抖音底部导航"消息"按钮 |
| 好友"只如初见" | 340 | 370 | 好友列表中的目标好友 |

---

## 九、API 概览

### 9.1 原生模块方法 (zbbAutomation)

```typescript
// 服务状态
isServiceRunning(): Promise<boolean>
openAccessibilitySettings(): Promise<void>
launchApp(packageName: string): Promise<boolean>

// 截屏和OCR
takeScreenshot(): Promise<string>
recognizeText(): Promise<string[]>
recognizeTextWithPosition(): Promise<OCRResult[]>

// 点击操作
click(x: number, y: number): Promise<boolean>
longClick(x: number, y: number, duration?: number): Promise<boolean>
clickByText(text: string): Promise<boolean>

// 手势操作
swipe(startX, startY, endX, endY, duration?): Promise<boolean>

// 元素查找
findElementByText(text: string): Promise<ElementInfo>
dumpWindowTreeString(): Promise<string>

// 文本操作
inputText(text: string): Promise<boolean>
getClipboardText(): Promise<string>

// 导航
pressBack(): Promise<boolean>

// 辅助
showToast(message: string): Promise<void>
delay(ms: number): Promise<void>
```

### 9.2 ElementInfo 结构

```typescript
interface ElementInfo {
  found: boolean;
  text?: string;
  contentDescription?: string;
  boundsCenterX?: number;
  boundsCenterY?: number;
  bounds?: { left, top, right, bottom };
}
```

---

## 十、配置文件

### 10.1 AndroidManifest.xml 关键配置

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

### 10.2 accessibility_service_config.xml

```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault"
    android:canPerformGestures="true"
    android:description="@string/accessibility_service_description"
    android:notificationTimeout="100"
    android:settingsActivity="com.example.MySettingsActivity" />
```

**关键配置**：`canPerformGestures="true"` 允许执行手势（点击、滑动）。

---

## 更新记录

| 日期 | 更新内容 |
|------|----------|
| 2025-04-26 | 初始化文档，整理功能、流程、结构 |
