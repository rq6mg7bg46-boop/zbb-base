// client/workflows/baoli/steps/paste.ts
// 保利 P8：3 动作触发 EMUI 粘贴弹窗 + 兜底坐标长按
// 来源：BaoliService.ts fillForm() L462-499

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P8：3 动作触发 EMUI 粘贴弹窗
 * 1) 找"粘贴完整客户信息..."节点 → 找不到用兜底"点击智能识别..." → 还找不到用兜底坐标长按
 * 2) 长按 2000ms 触发 EMUI 弹菜单
 * 3) tap(140, 720) 弹窗"粘贴"按钮（弹窗固定坐标不能偏移）
 * 4) 任何兜底都不 return（粘不上也要让 P9 继续）
 */
export const pasteCustomerInfoStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P8] 找"粘贴完整客户信息..."节点');
  await zbbAutomation.delay(1000);

  let pasteNode = await ctx.baoliService.findNodeByText('粘贴完整客户信息');
  if (!pasteNode) {
    // 兜底：另一个常见文案
    pasteNode = await ctx.baoliService.findNodeByText('点击智能识别，都可快速填充');
  }

  if (!pasteNode) {
    // P8 失败兜底（findNodeByText 内部已 retry 3 次）
    logToBoth('error', '[P8] 重试 3 次仍未找到输入框节点');
    logToBoth('warn', '[P8] 兜底坐标长按 @ (450, 800)');
    await maybePause();                                       // 拟人：长按前思考
    await zbbAutomation.longPress(450, 800, 2000);            // longPress 无 human 版本
    await zbbAutomation.delay(pGammaDelay(800, 1500));        // 拟人：Gamma 延迟
    await humanTap(140, 720);                                  // 拟人：±5px 偏移点击
    await maybePause();                                       // 拟人：tap 后停顿
    await ctx.baoliService.handlePasteFailure('[P8] 重试 3 次仍未找到输入框节点');
    ctx.pasteNode = null;
  } else {
    logToBoth('success', '[P8] 找到输入框 @ (' + pasteNode.centerX + ', ' + pasteNode.centerY + ')');

    // 动作 2：长按 2000ms 触发 EMUI 弹菜单
    logToBoth('info', '[P8] 长按输入框 2000ms 触发 EMUI 弹菜单');
    await zbbAutomation.longPress(pasteNode.centerX, pasteNode.centerY, 2000);

    // 动作 3：tap(140, 720) 弹窗"粘贴"按钮（P+ 保留：弹窗按钮固定不能偏移）
    logToBoth('info', '[P8] tap 弹窗"粘贴"按钮 @ (140, 720)');
    await zbbAutomation.delay(1000); // 等弹窗动画
    await zbbAutomation.tap(140, 720);

    // P+ 随机停顿（粘贴完成后的反应时间）
    await maybePause();

    // 保存节点供 P9 解析参考
    ctx.pasteNode = {
      centerX: pasteNode.centerX,
      centerY: pasteNode.centerY,
      text: pasteNode.text,
    };
  }

  return { ok: true };
};
