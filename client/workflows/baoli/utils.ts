// client/workflows/baoli/utils.ts
// 保利工作流工具函数（来源：BaoliService.ts L38-130，W4 抽出）
// W4 阶段纯机械复制，不重写

import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';

// ========== 延时配置（2026-06-20 老板拍板：原 3-5s 偏长，下调到 2-3s）==========
export const BAOLI_DELAY_CONFIG = {
  openApp: { min: 2000, max: 3000 },
  notice: { min: 2000, max: 3000 },
  other: { min: 2000, max: 3000 },
} as const;

/** getDelay(type) - 区间随机延时（毫秒） */
export function getDelay(type: 'openApp' | 'notice' | 'other'): number {
  switch (type) {
    case 'openApp':
      return Math.floor(
        Math.random() * (BAOLI_DELAY_CONFIG.openApp.max - BAOLI_DELAY_CONFIG.openApp.min + 1)
      ) + BAOLI_DELAY_CONFIG.openApp.min;
    case 'notice':
      return Math.floor(
        Math.random() * (BAOLI_DELAY_CONFIG.notice.max - BAOLI_DELAY_CONFIG.notice.min + 1)
      ) + BAOLI_DELAY_CONFIG.notice.min;
    default:
      return Math.floor(
        Math.random() * (BAOLI_DELAY_CONFIG.other.max - BAOLI_DELAY_CONFIG.other.min + 1)
      ) + BAOLI_DELAY_CONFIG.other.min;
  }
}

// ========== 拟人化工具（与千机 utils 同款）==========

/** 1. 不规则点击坐标（均匀分布 ±5px） */
export async function humanTap(x: number, y: number): Promise<void> {
  const dx = Math.round(Math.random() * 10 - 5);
  const dy = Math.round(Math.random() * 10 - 5);
  logToBoth('info', `[P+ humanTap] (${x},${y}) + (${dx},${dy})`);
  void zbbAutomation.tap(x + dx, y + dy);
}

/** 3. 随机停顿（Poisson 分布，默认 8% 概率）—— 用 @/actions.maybePause 替代 */
/** 已废弃：改用 @/actions/maybePause（一致行为 Poisson 分布 8%） */

/** 4. 页面停留时长（Gamma 分布替代均匀分布） */
export function pGammaDelay(min: number, max: number): number {
  const mean = (min + max) / 2;
  const variance = (max - min) / 4;
  const u1 = Math.max(0.0001, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const gamma = Math.round(mean + z * variance);
  return Math.max(min, Math.min(max, gamma));
}

/** 6. 拟人化上滑（手指惯性 overshoot + 回弹） */
export async function humanSwipeWithBounce(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  duration: number
): Promise<void> {
  // overshoot 100px 后回弹
  const overshootY = y2 - (y2 - y1) * 0.08;
  await zbbAutomation.swipe(x1, y1, x1, overshootY, duration);
  await zbbAutomation.delay(120);
  await zbbAutomation.swipe(x1, overshootY, x1, y2, duration * 0.5);
}
