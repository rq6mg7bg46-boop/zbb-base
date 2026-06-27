// client/workflows/baoli/steps/waitResult.ts
// 保利 P15：等待报备结果
// 来源：BaoliService.ts fillForm() L676-680
// P16 结果检测由 BaoliService.detectResult() 负责（不在本 workflow 内）

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P15：等待报备结果（3-6 秒随机）
 * P+ 随机停顿（报备结果查看）
 * 不检测结果，P16 由 BaoliService.detectResult() 负责
 */
export const waitReportResultStep: StepFn<BaoliContext, void> = async () => {
  logToBoth('info', '[P15] 等待报备结果（3-6 秒）...');
  await zbbAutomation.delay(pGammaDelay(3000, 6000));
  await maybePause();
  return { ok: true };
};
