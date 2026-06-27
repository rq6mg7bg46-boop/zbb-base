// client/workflows/qianji/steps/open.ts
// 千机步骤 1：打开千机 App（来源：QianjiService.ts stepOpenQianji L168-197）

import type { StepFn } from '@/engine';
import { maybePause } from '@/actions';
import { zbbAutomation } from '@/actions/_internal';
import { ActionError } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import type { QianjiContext } from '../types';
import { getDelay } from '../utils';

// 千机包名（与 QianjiService.ts L12-17 保持一致）
const QIANJI_PACKAGE = 'com.lianjia.anchang';
const QIANJI_MAIN_ACTIVITY = 'com.lianjia.link.platform.main.MainActivity';

/**
 * openQianjiStep - 千机步骤 1
 * 1. launchAppWithAmStart 启动千机
 * 2. delay 等待界面加载（openApp 2-3s 老板拍板）
 * 3. maybePause 8% 概率 Poisson 停顿
 */
export const openQianjiStep: StepFn<QianjiContext, void> = async () => {
  logToBoth('info', '[千机：步骤1] 正在打开千机...');

  const launched = await zbbAutomation.launchAppWithAmStart(
    QIANJI_PACKAGE,
    QIANJI_MAIN_ACTIVITY
  );

  if (!launched) {
    logToBoth('error', '[千机：步骤1] ✗ 千机启动失败');
    return { ok: false, error: new ActionError('openQianji', '千机启动失败') };
  }

  logToBoth('info', '[千机：步骤1] 千机已启动，等待界面加载...');
  await zbbAutomation.delay(getDelay('openApp'));
  await maybePause();

  logToBoth('success', '[千机：步骤1] ✓ 千机已打开');
  return { ok: true, data: undefined };
};