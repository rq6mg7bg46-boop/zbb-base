// client/actions/maybePause.ts
// 拟人化随机停顿 Action（v2 设计文档 §5.2 + P1 拟人化原则）

import { delay } from './delay';
import { ActionResult } from './types';

/** 泊松分布平均间隔（秒） */
const POISSON_MEAN_SEC = 2.0;
/** 最大停顿时间（毫秒） */
const MAX_PAUSE_MS = 3000;

/**
 * maybePause(probability?) - 拟人化随机停顿（默认 8% 概率）
 * 模拟用户"看看"操作：每步后有小概率停顿 0-3s（泊松分布）
 * 复用于 v1.6.4 保利步骤 4 后（老板 06-14 加，P3 概率 15% → 8% 加速）
 */
export async function maybePause(probability: number = 0.08): Promise<ActionResult> {
  if (Math.random() < probability) {
    const u = Math.random();
    const seconds = -Math.log(1 - u) * POISSON_MEAN_SEC;
    const ms = Math.max(0, Math.min(MAX_PAUSE_MS, Math.round(seconds * 1000)));
    if (ms > 0) await delay(ms);
  }
  return { ok: true };
}