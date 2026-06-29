// client/workflows/baoli/steps/paste.ts
// 保利 P8：3 动作触发 EMUI 粘贴弹窗 + 兜底坐标长按
// 来源：BaoliService.ts fillForm() L462-499

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { delay, maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { getPasteMenuCoord, getTapCoord, getLongPressCoord, dpToPx } from '@/utils/deviceModel';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P8：3 动作触发 EMUI 粘贴弹窗
 * 1) 找"粘贴完整客户信息..."节点 → 找不到用兜底"点击智能识别..." → 还找不到用兜底坐标长按
 * 2) 长按 2000ms 触发 EMUI 弹菜单
 * 3) tap 弹窗"粘贴"按钮（按机型分支 dp 坐标 → 屏宽归一化转 px，见 deviceModel.getPasteMenuCoord）
 * 4) 任何兜底都不 return（粘不上也要让 P9 继续）
 */
export const pasteCustomerInfoStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P8] 找"粘贴完整客户信息..."节点');
  await delay(1000);

  let pasteNode = await ctx.baoliService.findNodeByText('粘贴完整客户信息');
  if (!pasteNode) {
    // 兜底：另一个常见文案
    pasteNode = await ctx.baoliService.findNodeByText('点击智能识别，都可快速填充');
  }

  if (!pasteNode) {
    // P8 失败兜底（findNodeByText 内部已 retry 3 次）
    logToBoth('error', '[P8] 重试 3 次仍未找到输入框节点');
    const longPressPx = await getLongPressCoord('paste_longPress_fallback');
    logToBoth('warn', '[P8] 兜底坐标长按 @ (' + longPressPx.x + ', ' + longPressPx.y + ') px (按机型)');
    await maybePause();                                       // 拟人：长按前思考
    await zbbAutomation.longPress(longPressPx.x, longPressPx.y, 2000);  // longPress 无 human 版本
    await delay(pGammaDelay(800, 1500));        // 拟人：Gamma 延迟
    const fallbackDp = await getPasteMenuCoord();
    const fallbackPx = await dpToPx({ x: fallbackDp.x, y: fallbackDp.y });
    await humanTap(fallbackPx.x, fallbackPx.y);               // 拟人：±5px 偏移点击（按机型）
    await maybePause();                                       // 拟人：tap 后停顿
    await ctx.baoliService.handlePasteFailure('[P8] 重试 3 次仍未找到输入框节点');
    ctx.pasteNode = null;
  } else {
    logToBoth('success', '[P8] 找到输入框 @ (' + pasteNode.centerX + ', ' + pasteNode.centerY + ')');

    // 动作 2：长按 2000ms 触发 EMUI 弹菜单
    logToBoth('info', '[P8] 长按输入框 2000ms 触发 EMUI 弹菜单');
    await zbbAutomation.longPress(pasteNode.centerX, pasteNode.centerY, 2000);

    // 动作 3：按机型分支取弹窗"粘贴" dp 坐标 → 屏宽归一化转 px → 点击
    const dp = await getPasteMenuCoord();
    const px = await dpToPx(dp); // 接收 DpCoord 对象（v3 提取后）
    logToBoth('info', `[P8] tap 弹窗"粘贴"按钮 @ (${dp.x}, ${dp.y}) dp → (${px.x}, ${px.y}) px (按机型)`);
    await delay(1000); // 等弹窗动画
    await zbbAutomation.tap(px.x, px.y);

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
