# ZBB 开发规范与要求

> ZBB 自动化报备系统 - 代码规范、文件组织、开发要求

---

## 一、代码规范

### 1.1 TypeScript/JavaScript 规范

#### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类/接口 | PascalCase | `NativeAutomationService` |
| 方法/函数 | camelCase | `stepClickMessages` |
| 常量 | UPPER_SNAKE_CASE | `CLICK_X`, `DELAY_CONFIG` |
| 私有方法 | `_camelCase` | `_helperMethod` |
| 组件 | PascalCase | `HomeScreen` |

#### 类型定义

```typescript
// 使用 interface 定义对象结构
interface CustomerInfo {
  name: string;
  phone: string;
  source?: string;
  timestamp: number;
}

// 使用 type 定义联合类型或别名
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

// 导出类型
export interface ElementInfo {
  found: boolean;
  text?: string;
  boundsCenterX?: number;
  boundsCenterY?: number;
}
```

#### Async/Await 使用

```typescript
// 推荐：使用 async/await
async function fetchData(): Promise<Data> {
  const response = await api.getData();
  return response;
}

// 禁止：Promise.then() 链式调用（除非特殊场景）
```

### 1.2 Kotlin 规范

#### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类 | PascalCase | `AccessibilityServiceImpl` |
| 方法 | camelCase | `findNodeByTextInternal` |
| 常量 | UPPER_SNAKE_CASE | `TAG = "AccessibilityServiceImpl"` |
| 私有方法 | `camelCase` | `parseBounds` |

#### 日志输出

```kotlin
// 使用 Log 类输出日志
Log.d(TAG, "[方法名] 操作描述")
Log.e(TAG, "[方法名] ✗ 错误: ${error.message}")
Log.w(TAG, "[方法名] ⚠ 警告: 可能的原因")
Log.d(TAG, "[方法名] ✓ 成功: 返回值")
```

#### 线程处理

```kotlin
// 无障碍操作必须在主线程执行
private val mainHandler = Handler(Looper.getMainLooper())

fun safeExecute(action: () -> Unit) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
        mainHandler.post(action)
    } else {
        action()
    }
}
```

---

## 二、文件组织

### 2.1 目录结构

```
/workspace/projects/client/
├── app/                           # Expo Router 路由
│   ├── _layout.tsx               # 根布局
│   ├── home.tsx                  # 首页（re-export）
│   ├── index.tsx                 # 入口
│   └── *.tsx                     # 其他页面
│
├── screens/                       # 页面组件实现
│   ├── home/
│   │   └── index.tsx            # 首页
│   ├── logs/
│   │   └── index.tsx            # 日志页
│   └── settings/
│       └── index.tsx            # 设置页
│
├── services/                      # 业务逻辑
│   ├── NativeAutomationService.ts  # 自动化服务
│   ├── AutomationEngine.ts         # 流程引擎
│   └── CustomerTable.ts            # 客户表格
│
├── native/                        # 原生模块封装
│   ├── index.ts                   # 导出入口
│   └── ZBBAutomation.ts          # 原生模块
│
├── components/                    # 可复用组件
│   ├── Screen.tsx                # 页面容器
│   └── *.tsx                     # 其他组件
│
├── hooks/                         # 自定义 Hooks
├── contexts/                      # React Context
├── constants/                     # 常量定义
├── utils/                         # 工具函数
└── assets/                        # 静态资源
```

### 2.2 文件命名

| 文件类型 | 命名规范 | 示例 |
|----------|----------|------|
| 页面组件 | `PascalCase` | `HomeScreen.tsx` |
| 服务类 | `PascalCase` | `NativeAutomationService.ts` |
| 工具类 | `PascalCase` | `LogUtils.ts` |
| 常量 | `PascalCase` | `AppConfig.ts` |
| 类型定义 | `PascalCase` | `types.ts` |
| 样式文件 | `PascalCase` | `HomeStyles.ts` |

### 2.3 路由与页面对应关系

```
app/ 目录                screens/ 目录
────────────────         ────────────────
app/home.tsx         →   screens/home/index.tsx
app/logs.tsx         →   screens/logs/index.tsx
app/settings.tsx     →   screens/settings/index.tsx
```

---

## 三、Android 原生代码规范

### 3.1 AccessibilityService 实现

```kotlin
class AccessibilityServiceImpl : AccessibilityService() {
    
    companion object {
        var instance: AccessibilityServiceImpl? = null
            private set
        
        private const val TAG = "AccessibilityServiceImpl"
    }
    
    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "服务已连接")
    }
    
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 处理无障碍事件（可选实现）
    }
    
    override fun onInterrupt() {
        Log.w(TAG, "服务中断")
        instance = null
    }
    
    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "服务已销毁")
    }
}
```

### 3.2 React Native 模块注册

```kotlin
class AutomationPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AutomationModule(reactContext))
    }
    
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

### 3.3 MainApplication 注册

```kotlin
override fun getPackages(): List<ReactPackage> {
    return PackageList(this).packages.apply {
        add(AutomationPackage())
    }
}
```

### 3.4 AndroidManifest.xml 配置

```xml
<!-- 无障碍服务声明 -->
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

### 3.5 无障碍服务配置

```xml
<!-- res/xml/accessibility_service_config.xml -->
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRequestTouchExplorationMode"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:description="@string/accessibility_service_description"
    android:notificationTimeout="100"
    android:settingsActivity="com.zbb.automation.MainActivity" />
```

**关键配置说明**：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `canPerformGestures` | `true` | ⚠️ **必须** - 允许执行手势（点击、滑动） |
| `canRetrieveWindowContent` | `true` | ⚠️ **必须** - 允许获取窗口内容 |
| `accessibilityEventTypes` | `typeAllMask` | 监听所有事件类型 |
| `notificationTimeout` | `100` | 事件通知间隔（毫秒） |

**⚠️ 强制性要求（禁止省略）**：

```xml
<!-- 错误：省略关键配置会导致手势无法执行 -->
<accessibility-service ...>
    <!-- ✗ 缺少 canPerformGestures="true" -->
    <!-- ✗ 缺少 canRetrieveWindowContent="true" -->
</accessibility-service>

<!-- 正确：包含所有必须配置 -->
<accessibility-service ...>
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
</accessibility-service>
```

**历史教训**：如果省略 `canPerformGestures="true"`，`dispatchGesture()` 会返回 true 但实际不执行点击，日志显示"成功"但界面无反应。

---

## 四、自动化流程开发规范

### 4.1 步骤方法命名

```typescript
/**
 * 步骤方法命名规范
 * 格式: step + 操作名称
 * 每个步骤方法必须是 async 函数
 */
private async stepOpenDouyin(): Promise<void> { /* ... */ }
private async stepClickMessages(): Promise<void> { /* ... */ }
private async stepFindFriend(): Promise<void> { /* ... */ }
```

### 4.2 步骤方法模板

```typescript
private async stepXxx(): Promise<void> {
  const stepName = '步骤X: 描述';
  
  try {
    // 1. 日志记录
    logToBoth('info', `[抖音：步骤X] 开始操作...`);
    
    // 2. 更新状态
    automationEngine.updateCurrentStep(stepName);
    
    // 3. 延时等待
    await zbbAutomation.delay(getDelay('other'));
    
    // 4. 执行操作
    const success = await this.someOperation();
    
    // 5. 验证结果
    if (success) {
      logToBoth('success', `[抖音：步骤X] ✓ 操作成功`);
    } else {
      throw new Error('操作失败');
    }
    
  } catch (error) {
    logToBoth('error', `[抖音：步骤X] ✗ 操作失败: ${error}`);
    throw error;
  }
}
```

### 4.3 日志输出规范

```typescript
// 使用 logToBoth 统一日志输出
logToBoth('info', '[模块：步骤] 操作描述');
logToBoth('success', '[模块：步骤] ✓ 操作成功');
logToBoth('warn', '[模块：步骤] ⚠ 警告信息');
logToBoth('error', '[模块：步骤] ✗ 操作失败');

// 日志格式
// [时间] [级别] [模块名：步骤名] 消息
// [2025-04-26 10:30:15] [INFO] [抖音：步骤2] 点击消息按钮...
```

### 4.4 延时配置

```typescript
// 统一使用 getDelay 函数获取延时
import { getDelay } from '@/constants/Delays';

// 在需要延时的操作后调用
await zbbAutomation.delay(getDelay('openApp'));  // 打开APP
await zbbAutomation.delay(getDelay('other'));    // 其他操作
```

### 4.5 错误处理

```typescript
// 使用 try-catch 包裹可能失败的操作
try {
  await zbbAutomation.click(x, y);
} catch (error) {
  logToBoth('error', `[步骤] 点击失败: ${error}`);
  // 根据需要决定是否重试或抛出异常
  throw error;
}

// 使用条件判断处理可选操作
if (someCondition) {
  await optionalOperation();
}
```

---

## 五、测试规范

### 5.1 单元测试

```typescript
// 测试文件命名
NativeAutomationService.test.ts
AutomationEngine.test.ts
```

### 5.2 手动测试检查清单

- [ ] 服务状态检查
- [ ] 权限申请流程
- [ ] 单步骤执行测试
- [ ] 完整流程测试
- [ ] 异常情况处理
- [ ] 日志输出正确性

### 5.3 调试输出

```typescript
// 开发环境启用详细日志
const DEBUG_MODE = __DEV__;

if (DEBUG_MODE) {
  console.log('[调试] 变量值:', someVariable);
}
```

---

## 六、提交规范

### 6.1 Git 提交信息

```
<类型>(<范围>): <描述>

[类型]
- feat: 新功能
- fix: 修复 bug
- docs: 文档更新
- style: 代码格式
- refactor: 重构
- test: 测试相关
- chore: 构建/工具相关

[示例]
feat(douyin): 添加步骤2固定坐标点击
fix(automation): 修复 longClick 方法调用错误
docs(readme): 更新项目文档
```

### 6.2 提交前检查

- [ ] 代码格式正确
- [ ] 无 TypeScript 编译错误
- [ ] 日志输出适当
- [ ] 异常处理完整
- [ ] 相关文档已更新

---

## 七、文档规范

### 7.1 文档命名

```
01_功能与架构.md
02_开发环境与问题解决.md
03_开发规范与要求.md
```

### 7.2 文档更新

- 新增功能后更新 `01_功能与架构.md`
- 遇到新问题后更新 `02_开发环境与问题解决.md`
- 修改规范后更新 `03_开发规范与要求.md`

---

## 八、安全注意事项

### 8.1 权限最小化

```xml
<!-- 只申请必要的权限 -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

### 8.2 服务配置

```xml
<!-- exported 必须为 false -->
<service
    android:name=".automation.AccessibilityServiceImpl"
    android:exported="false" />
```

### 8.3 敏感信息

- 禁止硬编码包名、密钥等信息
- 使用配置文件管理敏感参数
- 日志中禁止输出敏感数据

---

## 九、版本管理

### 9.1 版本号规范

```
主版本.次版本.修订版本
例如: 1.0.0

- 主版本: 不兼容的重大更新
- 次版本: 向下兼容的功能新增
- 修订版本: 向下兼容的问题修复
```

### 9.2 APK 命名

```
app-debug-v1.0.0-20250426.apk
app-release-v1.0.0-20250426.apk
```

---

## 更新记录

| 日期 | 更新内容 |
|------|----------|
| 2025-04-26 | 初始化文档，制定代码规范和开发要求 |
