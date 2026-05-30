# ZBB 开发记录

> 本文档记录 ZBB 项目的每次修改、工作、问题和解决方案

---

## 版本记录

### v1.6.1 - 2026-04-04

#### 本次完成工作

1. **修复 JS 调用方式**
   - 问题：首页调用 `zbbAutomation.isServiceRunning()` 失败
   - 原因：`ZBBAutomation.ts` 中方法定义为独立函数，但首页期望 `zbbAutomation` 是对象
   - 解决方案：重写 `client/native/index.ts`，将所有方法合并到 `zbbAutomation` 对象中

#### 本次修改的文件

| 文件 | 修改内容 |
|------|----------|
| `client/native/index.ts` | 重写，合并所有方法到 zbbAutomation 对象 |

#### 本次测试结果

- ✅ JS 调用方式已修复
- ❌ **无障碍列表中仍未显示 ZBB**

#### 未解决的问题

**问题**：无障碍列表中没有 ZBB

**分析**：
- Android 配置看起来正确（exported="true", AutomationPackage 已注册）
- 但无障碍列表中没有出现 ZBB

**可能的解决方案**：

| 方案 | 说明 | 待验证 |
|------|------|--------|
| 方案 1 | 检查 `accessibility_service_config.xml` 是否存在 | ⏳ |
| 方案 2 | 检查 `strings.xml` 是否有 `accessibility_service_description` | ⏳ |
| 方案 3 | 检查 APK 编译时是否包含了无障碍服务配置 | ⏳ |
| 方案 4 | 检查编译后的 APK 中 AndroidManifest.xml 是否正确 | ⏳ |

**下一步**：
1. 检查沙箱中 `accessibility_service_config.xml` 是否存在
2. 检查 `strings.xml` 内容
3. 用 `aapt` 检查编译后的 APK 中的 AndroidManifest

---

### v1.6 - 2026-04-04

#### 完成工作

1. **同步 Kotlin 原生模块文件**
   - `AutomationModule.kt` - 原生模块实现
   - `AutomationPackage.kt` - 包注册类
   - `AccessibilityServiceImpl.kt` - 无障碍服务实现
   - `MainApplication.kt` - 添加了 `add(AutomationPackage())`

2. **修复 NativeModules 解构问题**
   - 改用 `NativeModules.ZBBAutomation` 直接访问

#### 遇到的问题

1. **NativeModules 为空对象**
   - 原因：使用解构 `const { ZBBAutomation } = NativeModules` 会得到 undefined
   - 解决：直接访问 `NativeModules.ZBBAutomation`

2. **原生模块未注册**
   - 原因：MainApplication.kt 中没有 `add(AutomationPackage())`
   - 解决：添加注册代码

#### 测试结果

- ✅ `ZBBAutomation` 模块可以正常访问
- ✅ `isAccessibilityServiceRunning()` 可以调用
- ✅ `openAccessibilitySettings()` 可以调用
- ❌ 无障碍列表中没有 ZBB

---

### v1.5 - 2026-03-31

#### 完成工作

1. 创建无障碍服务基础架构
2. 实现 React Native 桥接模块

#### 遇到的问题

1. **Android Release 版本闪退**
   - 错误：`useSyncExternalStore` 为 null
   - 尝试：禁用 New Architecture

2. **NDK 安装失败**
   - 解决：手动安装 NDK 27.1.12297006

---

## 开发原则

1. **每次修改 JS/TS 代码后，必须重新编译 APK**
2. **修改原生代码（Kotlin/Java）后，必须删除 `app/build` 目录重新编译**
3. **同步文件后，先验证再编译**

## 文件同步清单

| 文件类型 | 同步后操作 |
|----------|------------|
| JS/TS 文件 | 重新编译 APK |
| Kotlin/Java 文件 | 删除 app/build，重新编译 |
| XML 配置文件 | 删除 app/build，重新编译 |
| 资源文件 | 删除 app/build，重新编译 |

---

**最后更新**：2026-04-04 v1.6.1
