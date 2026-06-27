// client/workflows/qianji/steps/showGoAndWait.ts
// 千机 Q7：显示 GO 按钮 + 等用户点击 + 停止震动 + 退出小程序
// 来源：BaoliService.handleSuccessCase L978-1002（W7 抽回千机）
// 业务说明：用户截图后点 GO 按钮，Q7 完成后启动下一组客户

import type { StepFn } from '@/engine';
import { maybePause } from '@/actions';
import { zbbAutomation } from '@/actions/_internal';
import { pGammaDelay } from '../utils';
import { logToBoth } from '@/services/AutomationLogger';
import { DeviceEventEmitter } from 'react-native';
import { addScreenshotConfirmedListener, removeStopListener } from '@/native';
import type { QianjiContext } from '../types';

/**
 * Q7：显示 GO 按钮 + 等用户点击 + 停止震动 + 退出小程序
 * 行为：
 *   1. showScreenshotButton（GO 按钮浮窗）
 *   2. 等 onScreenshotConfirmed（用户点 GO）
 *   3. stopVibration
 *   4. emit zbbReportCompleted 通知首页
 *   5. exitMiniProgram × 2
 *
 * 触发：Q6 完成后由 qianjiReturnWorkflow 继续
 * 失败：老 v1.6.4 handleSuccessCase 完整保留为 fallback
 */
export const showGoAndWaitStep: StepFn<QianjiContext, void> = async (ctx) => {
  logToBoth('info', '[Q7] 显示GO按钮，等待用户点击...');
  await maybePause();
  await zbbAutomation.showScreenshotButton();

  // 等待用户点击 GO 按钮（触发 onScreenshotConfirmed）
  await new Promise<void>((resolve) => {
    const subscription = addScreenshotConfirmedListener(() => {
      logToBoth('success', '[Q7] 用户已点击GO按钮');
      removeStopListener(subscription);
      resolve();
    });
  });

  // 停止震动
  await zbbAutomation.stopVibration();

  // 2026-06-21 方案B：Q7 GO 后 +1（接龙完成 = 完整一组客户）
  ctx.relayGroupCount = (ctx.relayGroupCount ?? 0) + 1;
  logToBoth('info', '[Q7] GO 后通知首页累计数 +1, 当前=' + ctx.relayGroupCount);
  DeviceEventEmitter.emit('zbbReportCompleted', { count: ctx.relayGroupCount });

  // W7 异步化：Q6 阶段已 pressBack + pressHomeKey + 打开千机，保利小程序必然已退
  // 老 v1.6.4 exitMiniProgram × 2 是双保险（保利可能在 Q6 切换时未退干净）
  // V2 阶段保利端 fillForm → handleSuccessCase(round=2) → emit ON_BAOLI_LAUNCH_DONE 触发千机 Q6/Q7
  // Q6 已打开千机（保利小程序已退），Q7 阶段不需要 exitMiniProgram
  // 老 v1.6.4 handleSuccessCase 完整保留为 fallback

  logToBoth('success', '[Q7] 完整一组客户报备完成（V2 异步链路）');
  await pGammaDelay(500, 1000);

  return { ok: true };
};
