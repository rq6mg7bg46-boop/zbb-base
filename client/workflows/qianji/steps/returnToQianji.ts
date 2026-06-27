// client/workflows/qianji/steps/returnToQianji.ts
// 千机 Q6：返回报备界面 + 桌面 + 千机 + 点"报备有效" + 震动 + Toast
// 来源：BaoliService.handleSuccessCase L945-976（W7 抽回千机）
// 业务说明：保利流程结束，回千机准备接龙下一组

import type { StepFn } from '@/engine';
import { maybePause } from '@/actions';
import { zbbAutomation } from '@/actions/_internal';
import { pGammaDelay } from '../utils';
import { logToBoth } from '@/services/AutomationLogger';
import type { QianjiContext } from '../types';

/**
 * Q6：返回千机点"报备有效" + 震动 + Toast
 * 行为：
 *   1. pressBack 回报备界面（保利流程结束）
 *   2. pressHomeKey 回桌面
 *   3. launchAppWithAmStart 打开千机
 *   4. 等 5s（千机启动）
 *   5. 找"报备有效" + 点击
 *   6. startPulseVibration（重号提示，W7 阶段保持老行为）
 *   7. showToast 提示用户截图
 *
 * 触发：ON_BAOLI_LAUNCH_DONE event 由 QianjiService 订阅，调用 qianjiReturnWorkflow.run(ctx)
 * 失败：老 v1.6.4 handleSuccessCase 完整保留为 fallback
 */
export const returnToQianjiStep: StepFn<QianjiContext, void> = async (ctx) => {
  logToBoth('info', '[Q6] 返回报备界面...');
  await maybePause();
  await zbbAutomation.pressBack();
  await zbbAutomation.delay(1000);

  logToBoth('info', '[Q6] 按Home键返回桌面...');
  await zbbAutomation.pressHomeKey();
  await zbbAutomation.delay(1500);

  logToBoth('info', '[Q6] 打开千机...');
  await zbbAutomation.launchAppWithAmStart(
    'com.lianjia.anchang',
    'com.lianjia.link.platform.main.MainActivity'
  );
  await zbbAutomation.delay(5000);

  logToBoth('info', '[Q6] 识别当前界面...');
  const nodesAfterOpen = await zbbAutomation.getAllTextNodes();
  const baobeiYouxiaoNode = nodesAfterOpen?.find((n: any) => n.text?.includes('报备有效'));
  if (baobeiYouxiaoNode) {
    logToBoth('success', '[Q6] 找到"报备有效" @ (' + baobeiYouxiaoNode.centerX + ', ' + baobeiYouxiaoNode.centerY + ')，点击...');
    await zbbAutomation.click(baobeiYouxiaoNode.centerX, baobeiYouxiaoNode.centerY);
  } else {
    logToBoth('warn', '[Q6] 未找到"报备有效"，跳过');
  }

  logToBoth('info', '[Q6] 系统震动+Toast...');
  await zbbAutomation.startPulseVibration();
  // 2026-06-21 老板拍板：Toast（系统级）替代 Alert（依赖 Activity 在前台），
  // 移除 Alert 块 → 纯死代码
  await zbbAutomation.showToast('✅ 已完成报备，请选择正确二维码截图。记得核对姓名及电话！');
  await pGammaDelay(500, 1000);

  return { ok: true };
};
