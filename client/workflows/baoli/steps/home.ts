// client/workflows/baoli/steps/home.ts
// 保利 P1：按 Home 退出到桌面（v1.6.4 execute() L243-247）
// 来源：BaoliService.ts execute() L243-247

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';
import type { BaoliContext } from '../types';

/**
 * P1：按 Home 键退出到桌面，等待 2-3 秒确保桌面完全加载
 */
export const pressHomeToDesktopStep: StepFn<BaoliContext, void> = async () => {
  logToBoth('info', '[P1] 按 Home 键退出到桌面...');
  await zbbAutomation.pressHomeKey();
  // 等待 2-3 秒随机时间确保桌面完全加载
  await zbbAutomation.delay(2000 + Math.floor(Math.random() * 1000));
  return { ok: true };
};
