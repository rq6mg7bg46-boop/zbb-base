// client/engine/executor.ts
// Workflow 执行器（v2 设计文档 §5.5）

import type {
  Workflow,
  WorkflowContext,
  WorkflowResult,
  WorkflowState,
  GoOnFailConfig,
} from './types';

/**
 * runWorkflow(workflow, context) - 按顺序执行 workflow.steps
 * - 状态机：idle → running → (paused → running)* → completed | stepFailed | aborted
 * - 单步失败 + 有 goOnFail：走 GO 兜底（pause → waitForGo → retry/continue/abort）
 * - 单步失败 + 无 goOnFail：直接 abort
 * - 任一步骤抛异常：捕获后返回 ok=false（不静默）
 *
 * @example
 * const result = await runWorkflow(baoliFillFormWorkflow, {
 *   data: {},
 *   stepIndex: 0,
 *   state: 'idle',
 *   log: (level, msg) => console.log(level, msg),
 *   waitForGo: (reason, hint) => waitForUserGo(reason, hint),
 * });
 */
export async function runWorkflow(
  workflow: Workflow,
  context: WorkflowContext
): Promise<WorkflowResult> {
  let state: WorkflowState = workflow.initialState ?? 'idle';
  const stepResults: WorkflowResult['stepResults'] = [];
  const totalSteps = workflow.steps.length;

  for (let i = 0; i < totalSteps; i++) {
    const s = workflow.steps[i];
    state = 'running';
    context.stepIndex = i;
    context.state = state;
    context.log('info', `[${workflow.name}] 步骤 ${i + 1}/${totalSteps}: ${s.name}`);

    let result;
    try {
      // step 接 ctx 而非 undefined（v2 设计文档 §5.5 - 步骤共享 workflow 上下文）
      result = await s.fn(context);
    } catch (e) {
      // 抛异常 = 严重错误，直接 stepFailed
      state = 'stepFailed';
      stepResults.push({ name: s.name, ok: false, error: e });
      context.log('error', `[${s.name}] 异常: ${String(e)}`);
      return { ok: false, state, error: e, stepResults };
    }

    if (!result.ok) {
      if (!s.goOnFail) {
        // 无 GO 兜底配置 → 直接 stepFailed
        state = 'stepFailed';
        stepResults.push({ name: s.name, ok: false, error: result.error });
        context.log('error', `[${s.name}] 失败（无 GO 兜底）`);
        return { ok: false, state, error: result.error, stepResults };
      }
      // 有 goOnFail → 走 GO 兜底
      const goResult = await handleGo(s, context);
      if (goResult === 'abort') {
        state = 'aborted';
        stepResults.push({ name: s.name, ok: false, error: result.error });
        return { ok: false, state, error: result.error, stepResults };
      }
      if (goResult === 'continue') {
        stepResults.push({ name: s.name, ok: false, error: result.error });
        context.log('warn', `[${s.name}] GO 后 continue（跳过）`);
        continue;
      }
      // goResult === 'retry-ok'
      stepResults.push({ name: s.name, ok: true });
      context.log('success', `[${s.name}] GO 重试成功`);
    } else {
      stepResults.push({ name: s.name, ok: true });
    }
  }

  state = workflow.finalState ?? 'completed';
  context.state = state;
  context.log('success', `[${workflow.name}] 全部 ${totalSteps} 步完成 → ${state}`);
  return { ok: true, state, stepResults };
}

/**
 * handleGo(step, context) - GO 兜底处理
 * 返回 'retry-ok' | 'continue' | 'abort'
 * - 第一次失败 → 暂停 + waitForGo → 根据 goOnFail.action 决定
 * - action='retry'（默认）：重试 maxRetries 次（每次失败都 waitForGo）
 * - action='continue'：标记 continue，executor continue 到下一步
 * - action='abort'：标记 abort，executor 返回 ok=false
 */
async function handleGo(
  step: { name: string; fn: (input: unknown) => Promise<{ ok: boolean; data?: unknown; error?: unknown }>; goOnFail?: GoOnFailConfig },
  context: WorkflowContext
): Promise<'retry-ok' | 'continue' | 'abort'> {
  const cfg = step.goOnFail!;
  context.state = 'paused';
  context.log('warn', `[${step.name}] GO 暂停: ${cfg.reason}`);
  await context.waitForGo(cfg.reason, cfg.hint);
  context.state = 'running';

  const action = cfg.action ?? 'retry';
  if (action === 'abort') return 'abort';
  if (action === 'continue') return 'continue';

  // action === 'retry'
  const maxRetries = cfg.maxRetries ?? 3;
  for (let r = 0; r < maxRetries; r++) {
    const retry = await step.fn(context);
    if (retry.ok) return 'retry-ok';
    context.log('warn', `[${step.name}] GO retry ${r + 1}/${maxRetries} 失败`);
    if (r < maxRetries - 1) {
      context.state = 'paused';
      await context.waitForGo(cfg.reason, cfg.hint);
      context.state = 'running';
    }
  }
  // 所有 retry 都失败 → abort
  context.log('error', `[${step.name}] GO retry ${maxRetries} 次全部失败 → abort`);
  return 'abort';
}