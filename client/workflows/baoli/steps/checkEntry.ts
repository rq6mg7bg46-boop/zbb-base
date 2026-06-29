// client/workflows/baoli/steps/checkEntry.ts
// 保利 P10：入口检测 + 点击"请选择分期"
// 来源：BaoliService.ts fillForm() L596-619

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { delay, maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P10：
 * 1) 入口检测 isFormFilledSilent（静默版，仅 1 行汇总日志，避免节点刷屏）
 * 2) 点击"请选择分期"
 * 3) 等待 2-3 秒
 * 4) maybePause
 */
export const selectInstallmentStep: StepFn<BaoliContext, void> = async (ctx) => {
  // 入口检测：isFormFilled（静默版，仅 1 行汇总日志，避免节点刷屏）
  ctx.formFilled = ctx.baoliService.isFormFilledSilent(ctx.formNodes);
  logToBoth(
    ctx.formFilled ? 'success' : 'warn',
    `[P10 入口检测] 表单${ctx.formFilled ? '已填充 ✅' : '未填充 ⚠️'} 节点数: ${ctx.formNodes.length}`
  );

  // 点击"请选择分期"
  logToBoth('info', '[P10] 点击"请选择分期"...');
  await ctx.baoliService.printScreenText();
  const fenqiNode = await ctx.baoliService.findNodeByText('请选择分期');
  if (fenqiNode) {
    logToBoth('success', '[P10] 找到"请选择分期" @ (' + fenqiNode.centerX + ', ' + fenqiNode.centerY + ')');
    await humanTap(fenqiNode.centerX, fenqiNode.centerY);
  } else {
    const fallback = await getTapCoord('checkEntry_fenqi');
    logToBoth('warn', '[P10] 未找到"请选择分期"，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型)');
    await maybePause();       // 拟人：思考
    await humanTap(fallback.x, fallback.y);  // 已是 humanTap，保留
    await maybePause();       // 拟人：tap 后停顿
  }

  // 等待 2-3 秒（用纯 JS delay，绕开 Android Looper 后台冻结；
  //   zbbAutomation.delay 调 native bridge，后台时 Looper 冻结 promise 不 resolve）
  await delay(pGammaDelay(2000, 3000));
  // P+ 随机停顿（分期选择后）
  await maybePause();

  return { ok: true };
};
