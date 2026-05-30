# Expo App + Express.js

## 目录结构规范（严格遵循）

当前仓库是一个 monorepo（基于 pnpm 的 workspace）

- Expo 代码在 client 目录，Express.js 代码在 server 目录
- 本模板默认无 Tab Bar，可按需改造

目录结构说明

├── server/                     # 服务端代码根目录 (Express.js)
|   ├── src/
│   │   └── index.ts            # Express 入口文件
|   └── package.json            # 服务端 package.json
├── client/                     # React Native 前端代码
│   ├── app/                    # Expo Router 路由目录（仅路由配置）
│   │   ├── _layout.tsx         # 根布局文件（必需，务必阅读）
│   │   ├── home.tsx            # 首页
│   │   └── index.tsx           # re-export home.tsx
│   ├── screens/                # 页面实现目录（与 app/ 路由对应）
│   │   └── demo/               # demo 示例页面
│   │       ├── index.tsx       # 页面组件实现
│   │       └── styles.ts       # 页面样式
│   ├── components/             # 可复用组件
│   │   └── Screen.tsx          # 页面容器组件（必用）
│   ├── hooks/                  # 自定义 Hooks
│   ├── contexts/               # React Context 代码
│   ├── constants/              # 常量定义（如主题配置）
│   ├── utils/                  # 工具函数
│   ├── assets/                 # 静态资源
|   └── package.json            # Expo 应用 package.json
├── package.json
├── .cozeproj                   # 预置脚手架脚本（禁止修改）
└── .coze                       # 配置文件（禁止修改）

## 依赖管理与模块导入规范

### 依赖安装
**禁止**使用 `npm` 或 `yarn`，按目录区分安装命令：

| 目录 | 安装命令 | 说明 |
|------|----------|------|
| `client/` | `npx expo install <package>` | Expo 会自动选择与 SDK 兼容的版本 |
| `server/` | `pnpm add <package>` | 使用 pnpm 管理后端依赖 |

```bash
# client 目录（Expo 项目）
cd client && npx expo install expo-camera expo-image-picker

# server 目录（Express 项目）
cd server && pnpm add axios cors
```

**网络问题处理**：`npx expo install` 可能因网络原因失败，失败时重试 2 次，仍失败则改用 `pnpm add` 安装

## Expo 开发规范

### 路径别名

Expo 配置了 `@/` 路径别名指向 `client/` 目录：

```tsx
// 正确
import { Screen } from '@/components/Screen';

// 避免相对路径
import { Screen } from '../../../components/Screen';
```

## 本地开发

运行 coze dev 可以同时启动前端和后端服务，如果端口已占用，该命令会先杀掉占用端口的进程再启动，也可以用来重启前端和后端服务

```bash
coze dev
```

---

# ZBB 自动化应用 - 项目进度文档

## 1. 项目类型

**ZBB 自动化应用** - 基于 Android 的无障碍服务自动化工具

| 组件 | 技术栈 |
|------|--------|
| 前端 | Expo SDK 54 + React Native 0.81.5 |
| 后端 | Express.js |
| 原生能力 | Android 无障碍服务 (AccessibilityService) |
| 目标平台 | Android 真机 |

---

## 2. 部分架构

| 模块 | 说明 |
|------|------|
| **原生模块** | `ZBBAutomation` - Kotlin 实现的 Android 无障碍服务 |
| **JS 接口** | `client/native/ZBBAutomation.ts` - 封装原生模块调用 |
| **功能** | 点击、滑动、输入等自动化操作 |
| **权限** | BIND_ACCESSIBILITY_SERVICE、INTERNET 等 |
| **构建方式** | Expo Development Build |

---

## 3. 遇到的问题及解决状态

| 问题 | 状态 | 说明 |
|------|------|------|
| **NativeModules 为空** | ❌ 未解决 | `NativeModules.ZBBAutomation` 是 `undefined` |
| Release 闪退 | ⚠️ 部分解决 | 禁用 New Architecture 后仍有问题 |
| Hermes 配置 | ✅ 已确认 | `hermesEnabled=true`（正确） |
| AndroidManifest exported | ✅ 已修复 | `exported="true"` 已设置 |
| Reanimated | ✅ 已移除 | 确认未使用后移除 |
| Web 版本运行 | ✅ 正常 | NativeModules 在 Web 上为空是正常的 |

---

## 4. 问题详细分析

### 4.1 NativeModules 为空问题

**现象**：在 Android 真机上，`NativeModules` 对象为空

```typescript
// 当前测试结果
NativeModules = {}  // 空对象
NativeModules.ZBBAutomation = undefined
```

**可能原因**：
1. React Native 0.81.5 + Expo SDK 54 的兼容性问题
2. 原生模块未正确注册到 React Native 系统中
3. Hermes 引擎与原生模块系统的集成问题

**已尝试的解决方案**：
| 方案 | 结果 |
|------|------|
| 移除 react-native-reanimated | 无效 |
| 禁用 New Architecture | 无效 |
| 禁用 Hermes | 应用无法启动（JSC 原生库缺失） |
| 检查 AndroidManifest 配置 | 配置正确 |
| Debug APK 测试 | NativeModules 仍为空 |

### 4.2 Release 版本闪退问题

**原因**：`useSyncExternalStore` 与某些原生模块的兼容性问题

**已尝试的解决方案**：
- 禁用 New Architecture (`newArchEnabled: false`)

---

## 5. 下一步计划

### 方案 1：使用 --clean 参数重新预构建（推荐先试）

```powershell
# 1. 删除 client/android 目录

# 2. 执行预构建
cd E:\ZBB\projects_coze0330\client
npx expo prebuild --platform android --clean

# 3. 编译
cd android
.\gradlew clean
.\gradlew assembleDebug

# 4. 安装测试
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

### 方案 2：添加 console.error 拦截（备用）

在 `client/app/_layout.tsx` 顶部添加代码拦截 `useSyncExternalStore` 警告

### 方案 3：寻求外部支持

如果上述方案均无效，建议：
1. 向 React Native 官方反馈此问题
2. 向 Expo 官方反馈此问题
3. 考虑降级 Expo SDK 或 React Native 版本

---

## 6. 相关配置文件

| 文件 | 位置 | 关键配置 |
|------|------|----------|
| app.config.ts | client/ | newArchEnabled: false |
| gradle.properties | client/android/ | hermesEnabled=true, newArchEnabled=false |
| AndroidManifest.xml | client/android/app/src/main/ | exported="true" |
| ZBBAutomation.ts | client/native/ | 原生模块 JS 接口 |
| ZBBAutomationService.kt | client/android/app/src/main/java/ | 无障碍服务实现 |

---

## 7. 测试命令

```powershell
# 查看 NativeModules 状态
adb logcat | Select-String "NativeModules"

# 安装 APK
adb install -r app\build\outputs\apk\debug\app-debug.apk

# 卸载并重新安装
adb uninstall com.zbb.automation
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

---

*最后更新：2024年*
