// client/actions/swipe.ts
// 滑动类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';
import { delay } from './delay';

/**
 * swipe(x1, y1, x2, y2, opts?) - 拟人化滑动
 * - 默认 10 段 ease-in-out cubic 曲线（模拟手指加速→减速）
 * - 默认 500ms duration
 * 复用于千机步骤 3-2 上滑 4 次找"云和家经纪云" + 保利步骤 9 选分期滚动
 */
export async function swipe(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: { duration?: number; steps?: number }
): Promise<ActionResult> {
  const duration = opts?.duration ?? 500;
  const steps = opts?.steps ?? 10;
  try {
    const stepDelay = Math.max(20, Math.floor(duration / steps));
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const x = Math.round(x1 + (x2 - x1) * eased);
      const y = Math.round(y1 + (y2 - y1) * eased);
      await zbbAutomation.tap(x, y);  // 工具函数用 native tap 模拟连续滑动
      if (i < steps) await delay(stepDelay);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('swipe', e) };
  }
}

/**
 * scrollUp(opts?) - 列表上滑（向上滚动）
 * 默认从屏幕中下部 (540, 1500) 滑到上部 (540, 500)，duration 300ms
 * 复用于保利步骤 3 找"云和家经纪云"上滑 4 次
 */
export async function scrollUp(
  opts?: { fromY?: number; toY?: number; x?: number }
): Promise<ActionResult> {
  const x = opts?.x ?? 540;
  const fromY = opts?.fromY ?? 1500;
  const toY = opts?.toY ?? 500;
  return swipe(x, fromY, x, toY, { duration: 300 });
}

/**
 * scrollDown(opts?) - 列表下滑（向下滚动）
 * 默认从屏幕中上部 (540, 500) 滑到下部 (540, 1500)，duration 300ms
 */
export async function scrollDown(
  opts?: { fromY?: number; toY?: number; x?: number }
): Promise<ActionResult> {
  const x = opts?.x ?? 540;
  const fromY = opts?.fromY ?? 500;
  const toY = opts?.toY ?? 1500;
  return swipe(x, fromY, x, toY, { duration: 300 });
}