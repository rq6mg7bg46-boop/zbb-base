// client/actions/tap.ts
// 点击类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult, NodeTarget } from './types';
import { findText } from './find';

/**
 * tap(target, opts?) - 按 target 点击（自动解析 + 拟人化抖动）
 * - target.text:  按文本 includes 查找 + click center
 * - target.coord: 直接坐标 click
 * - target.desc:  按 content-desc 查找（暂未实现，TODO W6 adapters/）
 */
export async function tap(
  target: NodeTarget,
  opts?: { jitter?: boolean }
): Promise<ActionResult> {
  const shouldJitter = opts?.jitter ?? true;
  try {
    const coord = await resolveCoord(target);
    const final = shouldJitter ? humanJitter(coord) : coord;
    await zbbAutomation.click(final.x, final.y);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ActionError ? e : new ActionError('tap', e) };
  }
}

/**
 * tapWithRetry(target, opts?) - 点击失败自动重试
 * v2 GO 升级：v1.6.4 由调用方手动重试 → v2 默认 3 次
 */
export async function tapWithRetry(
  target: NodeTarget,
  opts?: { maxRetries?: number; jitter?: boolean }
): Promise<ActionResult> {
  const maxRetries = opts?.maxRetries ?? 3;
  let lastErr: ActionError | undefined;
  for (let i = 0; i < maxRetries; i++) {
    const result = await tap(target, { jitter: opts?.jitter });
    if (result.ok) return result;
    lastErr = result.error instanceof ActionError ? result.error : new ActionError('tapWithRetry', result.error);
  }
  return { ok: false, error: lastErr ?? new ActionError('tapWithRetry', null, `点击重试 ${maxRetries} 次仍失败`) };
}

/**
 * resolveCoord(target) - 把 NodeTarget 解析成 {x, y}（抛异常版，简化类型流）
 */
async function resolveCoord(target: NodeTarget): Promise<{ x: number; y: number }> {
  if (target.kind === 'coord') return { x: target.x, y: target.y };
  if (target.kind === 'text') {
    const r = await findText(target.text);
    if (!r.ok || !r.data) throw new ActionError('resolveCoord', null, `"${target.text}" 未找到`);
    return { x: r.data.centerX, y: r.data.centerY };
  }
  throw new ActionError('resolveCoord', null, `desc 查找待 W6 adapters/ 实现`);
}

/**
 * humanJitter(coord) - P+ 拟人化抖动（±5px 均匀分布，复用于 v1.6.4 humanTap）
 */
function humanJitter(coord: { x: number; y: number }): { x: number; y: number } {
  return {
    x: coord.x + Math.round(Math.random() * 10 - 5),
    y: coord.y + Math.round(Math.random() * 10 - 5),
  };
}