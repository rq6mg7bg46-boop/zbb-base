# ZBB 报备自动化项目技术文档

## 一、项目架构

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Expo 54 + React Native                    │
├─────────────────────────────────────────────────────────────┤
│  前端 (client/)          │  后端 (server/)                   │
│  - Expo Router 路由       │  - Express.js API                 │
│  - 原生桥接调用           │  - 数据库操作                     │
│  - UI 界面                │  - 业务逻辑                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Android Native (Java/Kotlin)                │
├─────────────────────────────────────────────────────────────┤
│  AccessibilityService    │  AutomationModule                  │
│  - 无障碍服务             │  - React Native 桥接              │
│  - 节点树遍历             │  - 事件分发                      │
│  - UI 操作                │  - Promise 回调                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 目录结构

```
/workspace/projects/
├── client/                          # Expo 前端
│   ├── app/                         # Expo Router 路由
│   ├── screens/                     # 页面实现
│   ├── components/                  # 可复用组件
│   ├── services/                    # 服务层
│   │   ├── NativeAutomationService.ts  # 自动化流程
│   │   ├── DatabaseService.ts          # 数据库服务
│   │   └── WorkWechatService.ts       # 企业微信服务
│   ├── native/                      # 原生桥接
│   │   └── index.ts                 # TypeScript 接口定义
│   └── android/
│       └── app/src/main/java/com/zbb/automation/
│           ├── AccessibilityServiceImpl.kt  # 无障碍服务实现
│           ├── AutomationModule.kt          # RN 桥接模块
│           ├── AutomationModuleManager.kt   # 模块管理
│           └── *.kt                        # 辅助类
├── server/                          # Express 后端
│   └── src/index.ts
└── assets/                          # 静态资源
```

## 二、原生桥接方案

### 2.1 React Native → Android 桥接架构

```
┌─────────────────────────────────────────────────────────────┐
│  TypeScript (native/index.ts)                               │
│  zbbAutomation.click(x, y) → Promise<boolean>               │
└─────────────────────────────────────────────────────────────┘
                              │ invoke
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  AutomationModule.kt (@ReactNative)                          │
│  @ReactMethod → 暴露给 JS 的方法                            │
└─────────────────────────────────────────────────────────────┘
                              │ 调用
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  AccessibilityServiceImpl.kt (单例)                         │
│  实际执行 UI 自动化操作                                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心文件说明

| 文件 | 职责 |
|------|------|
| `native/index.ts` | TypeScript 接口定义，封装 Promise 调用 |
| `AutomationModule.kt` | React Native 暴露接口（@ReactMethod） |
| `AccessibilityServiceImpl.kt` | 无障碍服务实现，单例模式 |

### 2.3 常用操作接口

```typescript
// 启动应用
zbbAutomation.launchApp(packageName: string): Promise<boolean>

// 点击坐标
zbbAutomation.click(x: number, y: number): Promise<boolean>

// 根据文字查找并点击
zbbAutomation.findElementByText(text: string): Promise<ElementInfo>

// 获取所有文本节点
zbbAutomation.getAllTextNodes(): Promise<NodeInfo[]>

// 滑动操作
zbbAutomation.swipe(startX, startY, endX, endY, duration): Promise<boolean>

// 获取当前包名
zbbAutomation.getCurrentPackageName(): Promise<string>

// 延时
zbbAutomation.delay(ms: number): Promise<boolean>
```

### 2.4 AccessibilityService 单例模式

```kotlin
companion object {
    internal var instance: AccessibilityServiceImpl? = null
    fun getInstance(): AccessibilityServiceImpl? = instance
}

override fun onServiceConnected() {
    instance = this
}

override fun onServiceDisconnected() {
    instance = null
}
```

## 三、无障碍服务方案

### 3.1 节点树遍历

```kotlin
// 获取根节点
val rootNode = rootInActiveWindow

// 深度优先遍历
fun traverseNode(node: AccessibilityNodeInfo, depth: Int = 0) {
    // 处理当前节点
    val text = node.text?.toString()
    val contentDesc = node.contentDescription?.toString()
    
    // 递归子节点
    for (i in 0 until node.childCount) {
        node.getChild(i)?.let { child ->
            traverseNode(child, depth + 1)
        }
    }
}
```

### 3.2 查找元素方法

```kotlin
// 根据文字查找
fun findNodeByText(text: String, clickable: Boolean = false): AccessibilityNodeInfo? {
    return rootInActiveWindow?.findAccessibilityNodeInfosByText(text)
        ?.firstOrNull { !clickable || it.isClickable }
}

// 根据包名查找
fun findNodeByPackage(packageName: String): AccessibilityNodeInfo? {
    return rootInActiveWindow?.findAccessibilityNodeInfosByViewByText(
        "*$packageName*"
    )?.firstOrNull()
}
```

### 3.3 执行点击/滑动

```kotlin
// 点击节点中心
fun clickNode(node: AccessibilityNodeInfo): Boolean {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val centerX = bounds.centerX()
    val centerY = bounds.centerY()
    
    val gesture = GestureDescription.Builder()
    val path = Path().apply { moveTo(centerX.toFloat(), centerY.toFloat()) }
    gesture.addStroke(GestureDescription.StrokeDescription(path, 0, 100))
    return dispatchGesture(gesture.build(), null, null)
}

// 滑动操作
fun swipe(startX: Int, startY: Int, endX: Int, endY: Int, duration: Long): Boolean {
    val path = Path().apply {
        moveTo(startX.toFloat(), startY.toFloat())
        lineTo(endX.toFloat(), endY.toFloat())
    }
    val gesture = GestureDescription.Builder()
        .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
        .build()
    return dispatchGesture(gesture.build(), null, null)
}
```

### 3.4 消息合并算法（多节点拼接）

```typescript
// 相邻节点 Y 坐标差 < 80px 则合并
function mergeNearbyNodes(nodes: TextNode[]): TextNode[] {
  if (nodes.length === 0) return [];
  
  const merged: TextNode[] = [nodes[0]];
  
  for (let i = 1; i < nodes.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = nodes[i];
    
    if (Math.abs(curr.y - prev.y) < 80) {
      // 合并到前一个节点
      prev.text += '\n' + curr.text;
      prev.endX = Math.max(prev.endX, curr.endX);
    } else {
      merged.push(curr);
    }
  }
  
  return merged;
}
```

## 四、数据库方案

### 4.1 SQLite 表结构

```sql
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT,
  customer_name TEXT NOT NULL,
  customer_gender TEXT,
  customer_phone TEXT NOT NULL,
  report_project TEXT,
  property_type TEXT,
  report_submit_time TEXT,
  expected_visit_time TEXT,
  agent_name TEXT,
  agent_remark TEXT,
  project_type TEXT NOT NULL,  -- 'yuexiu' | 'baoli'
  full_record TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' | 'success' | 'failed'
  copy_time TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 TypeScript 操作接口

```typescript
// 插入记录
async function insertReport(
  data: {
    customerName: string;
    customerGender: string;
    customerPhone: string;
    reportProject: string;
  },
  projectType: 'yuexiu' | 'baoli',
  fullRecord: string,
  copyTime: string
): Promise<number>

// 按类型获取最新记录
async function getLatestReportByType(
  projectType: 'yuexiu' | 'baoli'
): Promise<Report | null>

// 按类型获取所有记录
async function getReportsByType(
  projectType: 'yuexiu' | 'baoli'
): Promise<Report[]>

// 更新状态为成功
async function updateReportSuccess(id: number): Promise<void>
```

## 五、自动化流程设计

### 5.1 流程结构

```
┌─────────────────────────────────────────────────────────────┐
│  NativeAutomationService                                    │
├─────────────────────────────────────────────────────────────┤
│  isRunning: boolean        // 防止重复执行                   │
│  isAborted: boolean         // 支持中途停止                   │
│                                                             │
│  checkAbort()               // 检查是否被停止               │
│  checkServiceReady()        // 检查无障碍服务状态            │
│                                                             │
│  // 步骤方法                                                 │
│  stepOpenDouyin()           // 打开抖音                     │
│  stepClickMessages()        // 点击消息                     │
│  stepFindFriend()           // 查找好友                     │
│  stepClickChat()            // 进入对话框                   │
│  stepLongPressMessage()     // 长按消息                     │
│  stepParseMessage()        // 解析消息                     │
│  stepClickCopy()            // 写入数据库                   │
│                                                             │
│  openWechat()               // 打开企业微信                 │
│  searchAndEnterMiniApp()    // 搜索进入小程序               │
│  inputCustomerInfoFirst()   // 输入客户信息                 │
│  submitFirstProject()       // 提交报备                     │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 步骤方法模板

```typescript
private async stepXXX(): Promise<void> {
  logToBoth('info', '[模块] 步骤X：描述...');
  automationEngine.updateCurrentStep('描述');
  
  try {
    // 1. 执行操作
    await zbbAutomation.click(x, y);
    
    // 2. 等待加载
    await zbbAutomation.delay(getDelay('other'));
    
    // 3. OCR 确认（可选）
    const confirmed = await this.checkScreenText('预期文字', 2);
    
    // 4. 检查中止
    await this.checkAbort();
    
    logToBoth('success', '[模块] 步骤X完成');
  } catch (error) {
    logToBoth('error', `[模块] 步骤X失败: ${error}`);
    throw error;
  }
}
```

### 5.3 日志系统

```typescript
function logToBoth(level: 'info' | 'success' | 'warn' | 'error', message: string) {
  // 输出到 Metro Console
  console.log(`[ZBB ${level.toUpperCase()}] ${message}`);
  // 保存到日志系统
  automationEngine.log(level, message);
}
```

### 5.4 延时配置

```typescript
const DELAY_CONFIG = {
  openApp: { min: 10000, max: 15000 },  // 开APP
  other: { min: 2000, max: 3000 },       // 其他操作
  notice: { min: 5000, max: 5000 },      // 阅读须知
};

function getDelay(type: 'openApp' | 'other' | 'notice'): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

## 六、应用包名配置

```typescript
const APP_PACKAGES = {
  DOUYIN: 'com.ss.android.ugc.aweme',   // 抖音
  WECHAT: 'com.tencent.wework',          // 企业微信
};
```

## 七、消息格式识别

### 7.1 越秀格式（简洁）

```
越秀张女士15014233428
```

```typescript
// 正则提取
const match = text.match(/越秀(.+?)(\d{11})/);
const customerName = match[1];  // 张女士
const customerPhone = match[2]; // 15014233428
```

### 7.2 保利格式（多行）

```
客户姓名：刘女士
客户联系方式：159****1288
报备项目：保利缦城和颂
```

```typescript
// 多行解析
const nameMatch = text.match(/客户姓名[：:](.+)/);
const phoneMatch = text.match(/客户联系方式[：:](\d+\*\d+|\d+)/);
const projectMatch = text.match(/报备项目[：:](.+)/);
```

## 八、开发工具与调试

### 8.1 常用 ADB 命令

```bash
# 查看当前包名
adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp"

# 查看应用包名
adb shell pm list packages | grep tencent

# 启动应用
adb shell monkey -p com.tencent.wework -c android.intent.category.LAUNCHER 1

# 截图
adb exec-out screencap -p > screenshot.png

# 查看日志
adb logcat | grep ZBB
```

### 8.2 无障碍服务检测

```bash
# 检测服务是否开启
adb shell settings get secure enabled_accessibility_services
```

### 8.3 构建与部署

```bash
# 初始化项目
coze init --template expo

# 开发模式（前后端同时启动）
coze dev

# 单独构建
bash .cozeproj/scripts/dev_build.sh

# 单独运行
bash .cozeproj/scripts/dev_run.sh
```

## 九、关键文件索引

| 功能 | 文件路径 |
|------|----------|
| TypeScript 桥接 | `client/native/index.ts` |
| 自动化流程 | `client/services/NativeAutomationService.ts` |
| 数据库服务 | `client/services/DatabaseService.ts` |
| 无障碍实现 | `client/android/.../AccessibilityServiceImpl.kt` |
| RN 桥接模块 | `client/android/.../AutomationModule.kt` |
| 常量配置 | `client/services/NativeAutomationService.ts` (顶部) |

## 十、迁移检查清单

新建项目时，确保以下内容已配置：

- [ ] AndroidManifest.xml 添加无障碍服务权限
- [ ] AccessibilityService 在 android/app/src/main/ 注册
- [ ] React Native Module 暴露接口
- [ ] TypeScript 接口与 Kotlin 实现对应
- [ ] 数据库表结构创建
- [ ] 延时配置合理
- [ ] 日志系统集成
