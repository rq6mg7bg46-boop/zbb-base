# ZBB V2 Event Bus (W6 引入)

V2 异步派发事件总线（v2 设计文档 §5.5 + W6 老板拍板）。

## 目录结构

```
client/events/
├── core.ts                       事件总线核心（emitEvent / onEvent / offEvent）
├── qianji.ts                     千机端事件（ON_QIANJI_DATA_READY）
├── baoli.ts                      保利端事件（ON_BAOLI_LAUNCH_DONE）
└── index.ts                      统一导出
```

## 核心 API

```typescript
import { emitEvent, onEvent, offEvent } from '@/events';

// 发布
emitEvent('ON_QIANJI_DATA_READY', { customerInfo, targetApp: 'baoli' });

// 订阅
const sub = onEvent('ON_QIANJI_DATA_READY', (payload) => {
  // payload 类型自动推断
});

// 取消订阅
offEvent('ON_QIANJI_DATA_READY', sub);
```

底层基于 RN 内置 `DeviceEventEmitter`（v1.6.4 老 listener 也用同底层）。

## 事件清单

| 事件名 | 触发点 | payload | 订阅方 |
|---|---|---|---|
| `ON_QIANJI_DATA_READY` | 千机 Q5 dispatchStep | QianjiDataReadyPayload | 保利端 BaoliService（启动 V2 fillForm）|
| `ON_BAOLI_LAUNCH_DONE` | 保利 P7 clickReportStep | BaoliLaunchDonePayload | 未来千机端（千机端 Q6/Q7 抽回 + 收截图）|

## 异步派发链路（W6 收官）

```
[千机 Q5 step: ctx.dispatch()]
  ↓
[QianjiService.buildQianjiContext().dispatch]
  ↓
[emitEvent('ON_QIANJI_DATA_READY', payload)]
  ↓
[DeviceEventEmitter.emit]
  ↓
[BaoliService.initEventSubscriptions().onEvent]
  ↓
[startBaoliLaunchV2()]
  ↓
[runWorkflow(baoliLaunchWorkflow)]
  ↓
[runWorkflow(baoliFillFormWorkflow)]
  ↓
[detectResult / handleSuccessCase / handleSecondRound]
  ↓
[emitEvent('ON_BAOLI_LAUNCH_DONE', payload)]
  ↓
[未来千机端订阅 W7 接入]
```

## 老 v1.6.4 同步链路保留 1 周对比

- 老 `startQianjiFlow()` 内部直接调 `baoliService.execute()`（同步）
- 老 `fillForm()` / `handleSecondRound()` 完整保留
- 1 周并行对比：异步 vs 同步行为差异
- W8 收官时删老同步链路

## 设计决策

1. **基于 RN DeviceEventEmitter**：不引入新依赖
2. **payload 类型化**：`QianjiDataReadyPayload extends ZbbEventPayload = Record<string, unknown>`，编译时类型检查
3. **强类型事件名**：`ZbbEventName` union 限制，避免拼写错
4. **单例订阅句柄**：BaoliService.initEventSubscriptions 在 getInstance() 首次调用时挂载
5. **错误隔离**：event handler 异常被 `.catch` 捕获，不影响主流程
6. **ZbbEventSubscription 类型**：`EmitterSubscription` 的薄包装
