// client/engine/step.ts
// Step 编排三件套：pipe / sequence / parallel（v2 设计文档 §5.3）

import type { ActionResult } from '@/actions';
import { ActionError } from '@/actions';
import type { Action, StepFn } from './types';

/**
 * pipe(...fns) - 函数管道组合
 * - 左侧 Action 的 result.data 自动作为右侧 Action 的输入参数
 * - 任一 Action 返回 ok=false 时短路返回（后续 Action 不执行）
 * - 复用于 v2 workflows/baoli/steps.ts 的 step3_clickWorkbench = pipe(findText('工作台'), tap, delay)
 *
 * @example
 * const step3 = pipe(
 *   findText('工作台'),           // () => Promise<ActionResult<TextNode>>
 *   tap,                          // (node: TextNode) => Promise<ActionResult<void>>
 *   delay(1500),                  // () => Promise<ActionResult<void>>
 * );
 */
export function pipe<TIn, TMid, TOut>(
  a: Action<TIn, TMid>,
  b: Action<TMid, TOut>
): StepFn<TIn, TOut>;
export function pipe<TIn, TMid1, TMid2, TOut>(
  a: Action<TIn, TMid1>,
  b: Action<TMid1, TMid2>,
  c: Action<TMid2, TOut>
): StepFn<TIn, TOut>;
export function pipe<TIn, TMid1, TMid2, TMid3, TOut>(
  a: Action<TIn, TMid1>,
  b: Action<TMid1, TMid2>,
  c: Action<TMid2, TMid3>,
  d: Action<TMid3, TOut>
): StepFn<TIn, TOut>;
export function pipe<TIn, TMid1, TMid2, TMid3, TMid4, TOut>(
  a: Action<TIn, TMid1>,
  b: Action<TMid1, TMid2>,
  c: Action<TMid2, TMid3>,
  d: Action<TMid3, TMid4>,
  e: Action<TMid4, TOut>
): StepFn<TIn, TOut>;
export function pipe(...fns: Action<unknown, unknown>[]): StepFn<unknown, unknown> {
  return async (input: unknown): Promise<ActionResult<unknown>> => {
    let current: unknown = input;
    for (let i = 0; i < fns.length; i++) {
      const fn = fns[i];
      const result = (await (fn as Action<unknown, unknown>)(current)) as ActionResult<unknown>;
      if (!result.ok) {
        // 短路：返回失败 result（executor 检测 ok=false 走 GO）
        return result;
      }
      current = result.data;
    }
    return { ok: true, data: current };
  };
}

/**
 * sequence(...actions) - 顺序执行但丢弃 data 传递
 * - 每个 Action 独立调用，前一个的输出不传给下一个
 * - 复用于"打开 App 后立即 tap 启动按钮"等独立动作链
 *
 * @example
 * const step1 = sequence(
 *   openApp('com.tencent.wework'),
 *   delay(3000),
 * );
 */
export function sequence(...actions: Action<unknown, unknown>[]): StepFn<void, void> {
  return async (): Promise<ActionResult<void>> => {
    for (const action of actions) {
      const result = (await action(undefined)) as ActionResult<unknown>;
      if (!result.ok) return result as ActionResult<void>;
    }
    return { ok: true };
  };
}

/**
 * parallel(...actions) - 并发执行
 * - 用 Promise.all 并发执行（实际 RN 单线程，主要用于 IO 并发如多点 swipe）
 * - 任一失败立即 reject
 *
 * @example
 * const step_clearAll = parallel(
 *   delay(1000),
 *   showToast('开始'),
 *   maybePause(0),
 * );
 */
export function parallel(...actions: Action<unknown, unknown>[]): StepFn<void, void> {
  return async (): Promise<ActionResult<void>> => {
    try {
      const results = await Promise.all(
        actions.map((action) => action(undefined) as Promise<ActionResult<unknown>>)
      );
      const failed = results.find((r) => !r.ok);
      if (failed) return failed as ActionResult<void>;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: new ActionError('parallel', e) };
    }
  };
}