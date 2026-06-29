// client/workflows/baoli/steps/findProject.ts
// 保利 P5：找"郑州保利山水和颂" + tap
// 来源：BaoliService.ts execute() L313-332

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { delay, maybePause, showToast } from '@/actions';
import { ActionError } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/** P5 兜底超时（毫秒）—— 老板 2026-06-28 拍板 30s */
const P5_FALLBACK_TIMEOUT_MS = 30000;
/** P5 兜底用户操作检测窗口（毫秒） */
const P5_USER_ACTIVE_WINDOW_MS = 2000;

/**
 * P5：找"郑州保利山水和颂"（云和家小程序加载后第一屏）
 * - 3 次 find 循环，每次失败 delay Gamma 分布
 * - 都没找到 → 弹窗 + 30s 脉冲震动 + 监测用户操作
 *   - 检测到用户操作 → 杀流程（用户接管）
 *   - 30s 等待超时 → 杀流程
 */
export const findProjectStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P5] 找"郑州保利山水和颂"...');
  let projectEntry = null;
  for (let i = 0; i < 3; i++) {
    projectEntry = await ctx.baoliService.findNodeByText('郑州保利山水和颂', 1);
    if (projectEntry) {
      logToBoth('success', '[P5] 第 ' + (i + 1) + ' 次找到"郑州保利山水和颂" @ (' + projectEntry.centerX + ', ' + projectEntry.centerY + ')');
      break;
    }
    logToBoth('warn', '[P5] 第 ' + (i + 1) + ' 次未找到"郑州保利山水和颂"');
    // 老板 2026-06-28 调整：固定 1000ms 改为 Gamma 分布 800-1500ms（拟人化）
    await delay(pGammaDelay(800, 1500));
  }
  if (projectEntry) {
    await humanTap(projectEntry.centerX, projectEntry.centerY);
  } else {
    // 老板 2026-06-28 调整：删除兜底坐标 (810, 1440)，改用弹窗 + 震动 + 用户接管
    logToBoth('error', '[P5] 3 次未找到"郑州保利山水和颂"，启动用户接管兜底');
    logToBoth('warn', '[P5] 30s 内检测到用户操作或到时则杀流程');

    // 1) 弹窗提示（isLong=true 加 ⚠️ 前缀）
    await showToast('小主，请确定你已经登录了呢！', true);

    // 2) 清空点击历史（避免 ZBB 之前 tap 误报）
    await zbbAutomation.clearClickHistory();

    // 3) 启动 30s 脉冲震动（不用 pulseVibration 包装，自己控 stop 防 30s 内用户操作 stop 后又 auto-stop 冲突）
    await zbbAutomation.startPulseVibration();

    // 4) 30s 循环：每秒检查最近 2s 内有无真机点击
    const start = Date.now();
    let userActive = false;
    while (Date.now() - start < P5_FALLBACK_TIMEOUT_MS) {
      await delay(1000);
      const recent = await zbbAutomation.getRecentClick(P5_USER_ACTIVE_WINDOW_MS);
      if (recent && recent.found) {
        logToBoth('info', `[P5] 检测到用户操作 @ (${recent.x}, ${recent.y})`);
        userActive = true;
        break;
      }
    }

    // 5) 主动停止震动（幂等）
    await zbbAutomation.stopVibration();

    // 6) 杀流程（killZbbProcess + return ok:false 两道保险）
    const reason = userActive
      ? '[P5] 检测到用户操作，杀死流程'
      : '[P5] 30s 等待超时无操作，杀死流程';
    logToBoth('error', reason);
    void zbbAutomation.killZbbProcess();  // fire-and-forget：杀 ZBB app 自己
    return { ok: false, error: new ActionError('findProject', reason) };
  }
  await delay(pGammaDelay(2000, 3000));
  maybePause();
  return { ok: true };
};
