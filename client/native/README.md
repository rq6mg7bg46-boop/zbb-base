# ZBB Native Module (v2 重构 W6 精简后)

ZBB 原生模块（Kotlin + RN 桥接 + v2 拆 types + listener）。

## 目录结构（W6 拆后）

```
client/native/
├── index.ts                      1386 行（zbbAutomation 98 方法 + 1 export 段）
├── types.ts                      53 行（5 interface + QianjiMessagePayload）
├── events.ts                     101 行（5 add/remove listener + setZBBAutomationRef）
├── ZBBAutomation.ts              399 行（Kotlin 模块定义）
└── ZBBAutomation.d.ts            227 行（Kotlin 模块类型声明）
```

## 拆前 vs 拆后

| 文件 | 拆前 | 拆后 |
|---|---|---|
| native/index.ts | 1651 | 1386（-265 行）|
| native/types.ts | - | +53 |
| native/events.ts | - | +101 |
| 净 native/ | 1651 | 1540（-111 行）|

老板"native 1651 → 500"激进目标不可达：98 个方法体本身就有 ~1200 行。

## 拆出内容

### types.ts（53 行）
- `ElementInfo`（基础节点信息）
- `ClickableElement extends ElementInfo`
- `Point` / `Rect`
- `AccessibilityServiceStatus`
- `QianjiMessagePayload`（千机通知 payload）

### events.ts（101 行）
- `addStopListener` / `removeStopListener`
- `addScreenshotConfirmedListener`
- `addQianjiMessageListener` / `removeQianjiMessageListener`
- `setZBBAutomationRef`（让 events.ts 拿到 ZBBAutomation 单例）
- 内部 `eventEmitter: NativeEventEmitter | null` + `activeListeners[]`

## 兼容性

native/index.ts 通过 re-export 保持外部 import 不变：
- `import { zbbAutomation, addStopListener, ElementInfo } from '@/native'` 仍然可用
- 内部 import 已切换到 `./types` 和 `./events`（避免重复定义）

## W6 顺带清理

W3 期间 6-26 commit（GO 按钮 + 30s 兜底）加了 5 个重号辅助方法 + killZbbProcess 重复定义。拆 types 时 TS 暴露 L1117 重复错，删除后：

- `startPulseVibration` 重复段（L676 + L1373）→ 保留 L676
- `stopVibration` 重复段（L660 + L1391）→ 保留 L660
- `showToast` 重复段（L1161 + L1409）→ 保留 L1161
- `printScreenText` 重复段（L1428）→ 删除
- `delay` 重复段（L1145 + L1450）→ 保留 L1145
- `killZbbProcess` 重复段（L893 + L1377）→ 保留 L893

行为完全一致（同样调 `ZBBAutomation.startPulseVibration()` 等），删除不影响。

## 意外收益

W6 C4 顺带修了 5 个老错（140 → 135 baseline）：
- 5 个 TS1117 重复对象字面量属性错（重复方法定义）

## 下一步

- W7 抽回千机：Q6/Q7 从 BaoliService 抽到 QianjiService 或 orchestration layer
- W7 接入：千机端订阅 `ON_BAOLI_LAUNCH_DONE` 事件触发 Q6/Q7
