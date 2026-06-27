// client/engine/workflow.ts
// Workflow 构造器（v2 设计文档 §5.4）

import type {
  Step,
  StepFn,
  GoOnFailConfig,
  Workflow,
  WorkflowState,
} from './types';

/**
 * step(name, fn, opts?) - 构造一个 Step
 * - name:   步骤名（debug + 日志 + GO 文案）
 * - fn:     执行函数（StepFn<TIn, TOut>）
 * - opts.goOnFail: GO 失败兜底配置（可选）
 *
 * @example
 * step('openWeWork', openWeWorkStep, {
 *   goOnFail: { reason: '打开企业微信失败', hint: '请手动启动企业微信', action: 'retry' },
 * });
 */
export function step<TIn = void, TOut = void>(
  name: string,
  fn: StepFn<TIn, TOut>,
  opts?: { goOnFail?: GoOnFailConfig }
): Step {
  return {
    name,
    fn: fn as StepFn<unknown, unknown>,
    goOnFail: opts?.goOnFail,
  };
}

/**
 * workflow(def) - 构造一个 Workflow
 * - name:         workflow 名称（debug + 日志）
 * - initialState: 初始状态（默认 'idle'）
 * - steps:        步骤列表（按顺序执行）
 * - finalState:   完成态（默认 'completed'）
 *
 * @example
 * export const baoliFillFormWorkflow = workflow({
 *   name: 'baoli.fillForm',
 *   steps: [
 *     step('openWeWork', openWeWork),
 *     step('findWorkbench', findWorkbenchStep),
 *   ],
 * });
 */
export function workflow(def: {
  name: string;
  initialState?: WorkflowState;
  steps: Step[];
  finalState?: WorkflowState;
}): Workflow {
  return {
    name: def.name,
    initialState: def.initialState ?? 'idle',
    steps: def.steps,
    finalState: def.finalState ?? 'completed',
  };
}