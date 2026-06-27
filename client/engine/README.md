# ZBB Step 引擎 (v2 重构 W2)

v2 重构 Step 引擎 — 编排 + 执行 + GO 机制（2026-06-27）。

## 目录结构

```
client/engine/
├── types.ts        Action<TIn,TOut> / StepFn / Step / Workflow / WorkflowContext / WorkflowResult / WorkflowState
├── step.ts         pipe / sequence / parallel（编排三件套）
├── workflow.ts     step() / workflow()（构造器）
├── executor.ts     runWorkflow（执行器 + 状态机 + GO 兜底）
├── go.ts           waitForUserGo / withGoOnFail（GO 机制）
└── index.ts        统一导出
```

## 核心抽象

### 1. **pipe**（函数组合）

```typescript
import { pipe, findText, tap, delay } from '@/actions';

const step3_clickWorkbench = pipe(
  findText('工作台'),   // () => Promise<ActionResult<TextNode>>
  tap,                  // (node) => Promise<ActionResult<void>>
  delay(1500),          // () => Promise<ActionResult<void>>
);
```

- 左侧 Action 的 result.data 自动作为右侧 Action 的 input
- 任一 Action 返回 ok=false 短路
- 5 个 overload（2-6 个 Action 链）

### 2. **sequence / parallel**（顺序/并发）

```typescript
const step1 = sequence(openApp('com.tencent.wework'), delay(3000));
const step_clear = parallel(delay(1000), showToast('开始'), maybePause(0));
```

### 3. **step / workflow**（构造器）

```typescript
export const baoliFillFormWorkflow = workflow({
  name: 'baoli.fillForm',
  steps: [
    step('openWeWork', openWeWorkStep),
    step('findWorkbench', findWorkbenchStep, {
      goOnFail: { reason: '找不到"工作台"', hint: '请手动下拉', action: 'retry', maxRetries: 3 },
    }),
  ],
});
```

### 4. **runWorkflow**（执行器）

```typescript
const result = await runWorkflow(baoliFillFormWorkflow, {
  data: {},
  stepIndex: 0,
  state: 'idle',
  log: (level, msg) => console.log(level, msg),
  waitForGo: (reason, hint) => waitForUserGo(reason, hint),
});
```

**状态机**：`idle → running → (paused → running)* → completed | stepFailed | aborted`

### 5. **waitForUserGo / withGoOnFail**（GO 机制）

```typescript
// 单 Action 兜底
const node = await withGoOnFail(
  () => findText('工作台'),
  { reason: '找不到"工作台"', hint: '请手动下拉', action: 'retry', maxRetries: 3 },
);

// 手动触发（executor 内部用）
await waitForUserGo('步骤 4 失败', '请手动处理后点 GO');
```

**GO 流程**：
1. `showScreenshotButton` 弹浮窗按钮
2. `startPulseVibration` 30s 脉冲震动（native handler 30s 兜底）
3. `addScreenshotConfirmedListener` 监听用户点击 → resolve
4. 主动 `stopVibration`

## 迁移路径

### v1.6.4 → v2.0

| v1.6.4 | v2.0 |
|---|---|
| `BaoliService.runFillForm()` 1000+ 行手写 try/catch | `runWorkflow(baoliFillFormWorkflow, ctx)` |
| `BaoliService.ts:850` 步骤 9 GO 弹窗手写 | `step('screenshotConfirm', fn, { goOnFail })` |
| 千机步骤 4 GO 弹窗手写 | workflow.goOnFail 配置 |
| `utils/goResume.ts waitForUserGo` 重复实现 | 统一用 `engine/go.ts` |
| 业务侧 try/catch + 手动重试 | executor 统一处理 |

### W3-W4 计划

- **W3**: 迁移 QianjiService（千机）→ 调 `runWorkflow(qianjiCollectWorkflow, ctx)`
- **W4**: 迁移 BaoliService（保利）→ 调 `runWorkflow(baoliFillFormWorkflow, ctx)`
- 业务侧不再写 try/catch，executor 统一状态机处理

## 设计原则

- **StepFn 返回 ActionResult 而非抛错**（v1.6.4 → v2 演进，调用方更友好）
- **GO 兜底是配置而非逻辑**（`goOnFail: {...}` 写在 step 上，executor 自动处理）
- **状态机显式化**（P4 原则：`idle / running / paused / stepFailed / completed / aborted`）
- **不依赖 session 记忆**（每个 commit 自包含，每个 step 有 name）
- **机械替换**（W3-W4 业务侧只改 import + 删 try/catch，逻辑保持一致）

## 已知限制

- `runWorkflow` 当前不支持并行步骤（v2 路线图 W8 后考虑）
- `goOnFail.maxRetries` 默认 3（v1.6.4 经验值，可调整）
- `waitForUserGo` 用 console.log 而非 logToBoth（避免依赖 AutomationLogger，W8 联调时统一）
