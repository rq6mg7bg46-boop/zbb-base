/**
 * 拟人化自适应等待工具（P+ 方案 2026-06-14）
 *
 * 核心思路：
 *   - 旧：await delay(2000) 固定 delay，赌 UI 刷新完
 *   - 新：循环检测 UI 断言 + 满足后拟人反应 + 随机抖动
 *
 * 拟人化参数（关键）：
 *   - interval=600ms（不要 200ms，避免触发"频繁探测"风控）
 *   - reactionMin/Max=500-1500ms（人看到 UI→理解→准备操作）
 *   - timeout=10s（兜底防卡死）
 *
 * 使用示例：
 *   await waitUntilHumanized(
 *     async () => (await getAllTextNodes()).some(n => n.text?.includes('客户姓名')),
 *     { timeout: 10000, label: '等待客户姓名出现' }
 *   );
 */

import { zbbAutomation } from '@/native';
import { logToBoth } from './AutomationLogger';

export interface WaitUntilHumanizedOptions {
  /** 最长等待时间（ms），超过抛错。默认 10000 */
  timeout?: number;
  /** 检测间隔（ms），默认 600（不要 < 400，避免风控） */
  interval?: number;
  /** 满足后最小反应时间（ms），默认 500（人反应时间下限） */
  reactionMin?: number;
  /** 满足后最大反应时间（ms），默认 1500（人反应时间上限） */
  reactionMax?: number;
  /** log 标签 */
  label?: string;
  /** 满足后是否还要额外等待（多客户报备间隔） */
  extraDelayMin?: number;
  extraDelayMax?: number;
}

/**
 * 拟人化自适应等待
 * @param predicate 检测函数，返回 true 表示 UI 已就绪
 * @param options 配置
 * @returns 实际等待时长（含反应时间）
 */
export async function waitUntilHumanized(
  predicate: () => Promise<boolean>,
  options: WaitUntilHumanizedOptions = {}
): Promise<number> {
  const {
    timeout = 10000,
    interval = 600,
    reactionMin = 500,
    reactionMax = 1500,
    label = 'waitUntilHumanized',
    extraDelayMin = 0,
    extraDelayMax = 0,
  } = options;

  const start = Date.now();
  let checkCount = 0;

  // 1. 持续检测 UI 断言
  while (Date.now() - start < timeout) {
    checkCount++;
    try {
      const ok = await predicate();
      if (ok) {
        // 2. 满足 → 拟人反应时间（人眼读 + 手指准备）
        const reaction = randomBetween(reactionMin, reactionMax);

        // 3. 额外 delay（多客户报备间隔，防风控）
        const extra =
          extraDelayMax > 0 ? randomBetween(extraDelayMin, extraDelayMax) : 0;

        const totalReaction = reaction + extra;
        if (totalReaction > 0) {
          await zbbAutomation.delay(totalReaction);
        }

        const totalWait = Date.now() - start;
        logToBoth(
          'success',
          `[${label}] ✓ 断言通过 | 检查 ${checkCount} 次 | UI 等 ${totalWait - totalReaction}ms + 拟人反应 ${Math.round(totalReaction)}ms = 总 ${totalWait}ms`
        );
        return totalWait;
      }
    } catch (e: any) {
      // predicate 抛错（如节点访问失败），不退出，继续轮询
      logToBoth('warn', `[${label}] predicate 异常: ${e?.message || e}`);
    }

    await zbbAutomation.delay(interval);
  }

  // 4. 超时（兜底）
  const elapsed = Date.now() - start;
  logToBoth('error', `[${label}] ✗ 断言超时 ${timeout}ms（检查 ${checkCount} 次）`);
  throw new Error(`[${label}] 等待超时 (${timeout}ms)，UI 未达到要求`);
}

/**
 * 区间随机整数（拟人化抖动用）
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 拟人化坐标抖动（tap/swipe 用）
 * 中心 ± 5px，避免坐标过于精确触发风控
 */
export function humanizedCoord(
  centerX: number,
  centerY: number,
  jitterRange: number = 5
): { x: number; y: number } {
  return {
    x: Math.round(centerX + (Math.random() * 2 - 1) * jitterRange),
    y: Math.round(centerY + (Math.random() * 2 - 1) * jitterRange),
  };
}

/**
 * 拟人化长按时长（人手指"按下去"的随机时长）
 * 默认 1200-1800ms
 */
export function humanizedLongPressDuration(): number {
  return randomBetween(1200, 1800);
}

/**
 * 多客户报备间隔（频次控制，P+ 关键）
 * 30-60s 随机，模拟"换单思考"时间
 */
export function humanizedInterCustomerDelay(): number {
  return randomBetween(30000, 60000);
}
