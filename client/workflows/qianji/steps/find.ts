// client/workflows/qianji/steps/find.ts
// 千机 Q3：查找"报备审核"+ 转发 3 步 + 解析客户信息（数据出口）
// 来源：QianjiService.ts stepFindAndCollectCustomer L283-428

import type { StepFn } from '@/engine';
import { maybePause } from '@/actions';
import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';
import type { QianjiContext } from '../types';
import {
  pGammaDelay,
  humanTap,
  humanSwipeWithBounce,
  assembleKeyValueLines,
  parseClipboardText,
} from '../utils';

/**
 * findCustomerStep - 千机 Q3（找客户 + 转发 + 数据出口）
 * 子流程：
 *   Q3-1 找"报备审核"节点（最多 3 次滑动）
 *   Q3-2 找"保利"判断界面（无则 Toast + 震动 + lastExitReason='no_baoli'）
 *   Q3-3 转发 3 步：列表"转发" → 联系人"转发" → 分享页"复制"
 *   Q3-4 解析 lastTextNodes → customerInfo（写入 ctx = 数据出口）
 */
export const findCustomerStep: StepFn<QianjiContext, void> = async (ctx) => {
  logToBoth('info', '[Q3] 查找"报备审核"...');

  const textNodes = ctx.lastTextNodes;
  if (!textNodes || textNodes.length === 0) {
    logToBoth('warn', '[Q3] 无界面节点数据，请先执行 Q2');
    return { ok: true, data: undefined };
  }

  // Q3-1. 首次查找包含"报备审核"的节点
  let baobeiNode = textNodes.find((n) => n.text && n.text.includes('报备审核'));

  // Q3-1. 未找到则滑动屏幕（最多3次）
  let slideCount = 0;
  while (!baobeiNode && slideCount < 3) {
    slideCount++;
    logToBoth('info', `[Q3-1] 未找到，滑动屏幕 (${slideCount}/3)...`);
    // P+ 拟人化：手指惯性 overshoot + 回弹
    await humanSwipeWithBounce(540, 1200, 540, 1000, 800);
    await zbbAutomation.delay(pGammaDelay(1500, 2500));
    ctx.lastTextNodes = await zbbAutomation.getAllTextNodes();
    baobeiNode = ctx.lastTextNodes.find((n) => n.text && n.text.includes('报备审核'));
  }

  if (!baobeiNode) {
    logToBoth('warn', '[Q3-1] ✗ 未找到"报备审核"，结束步骤');
    // ★ 2026-06-21 修：补设 lastExitReason='no_baoli'，
    // 让 startQianjiFlow Q5 闸门能拦下来
    ctx.lastExitReason = 'no_baoli';
    return { ok: true, data: undefined };
  }

  logToBoth('info', `[Q3-1] 找到"报备审核" @ (${baobeiNode.centerX}, ${baobeiNode.centerY})`);

  // Q3-2. 判断是否为保利界面
  const isBaoli = textNodes.some((n) => n.text && n.text.includes('保利'));
  if (!isBaoli) {
    logToBoth('warn', '[Q3-2] 界面无"保利"，超出能力范围，提示用户');
    // 用 Toast 而非 Alert：Q3 时千机已覆盖前台，ZBB 在后台
    void zbbAutomation.showToast('⚠️ 小主，这个客户超出了我的能力范围，需要你亲自搞定！');
    // 脉冲震动 500ms
    try {
      await zbbAutomation.startPulseVibration();
      await zbbAutomation.delay(500);
      await zbbAutomation.stopVibration();
    } catch {
      // 震动失败不影响主流程
    }
    // 接龙循环退出标志
    // 老板要求：不要回桌面（让用户手动处理其他项目客户），所以这里不调 pressHome
    ctx.lastExitReason = 'no_baoli';
    return { ok: true, data: undefined };
  }

  logToBoth('info', '[Q3-2] 检测到"保利"，启动转发流程...');

  // ========== 转发流程获取脱敏号码 ==========

  // Q3-3-1：找列表里的"转发"按钮，点击（格式：转发(2)）
  const forwardBtns = textNodes.filter((n) => n.text && n.text.startsWith('转发'));
  if (forwardBtns.length === 0) {
    logToBoth('warn', '[Q3-3-1] 未找到"转发"按钮');
    return { ok: true, data: undefined };
  }
  const firstForward = forwardBtns[0];
  logToBoth(
    'info',
    `[Q3-3-1] 点击第1个"转发" @ (${firstForward.centerX}, ${firstForward.centerY})`
  );
  // P+ 拟人化：关键 tap 前迟疑 + ±5px 偏移
  await maybePause();
  await humanTap(firstForward.centerX, firstForward.centerY);
  await zbbAutomation.delay(pGammaDelay(2000, 3000));

  // Q3-3-2：识别联系人列表页，找"转发"按钮，点击（选Y值最大的）
  const nodes2 = await zbbAutomation.getAllTextNodes();
  logToBoth('info', `[Q3-3-2] 联系人列表页 (${nodes2.length}个节点)`);
  nodes2.forEach((node, index: number) => {
    if (node.text && node.text.trim().length > 0) {
      logToBoth(
        'info',
        `[Q3-3-2] 节点${index}: "${node.text}" @ (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`
      );
    }
  });
  const forwardList = nodes2.filter((n) => n.text && n.text.startsWith('转发'));
  if (forwardList.length === 0) {
    logToBoth('warn', '[Q3-3-2] 未找到联系人列表中的"转发"');
    return { ok: true, data: undefined };
  }
  // 取Y值最大的（屏幕下方）
  forwardList.sort((a, b) => b.centerY - a.centerY);
  const forwardInList = forwardList[0];
  logToBoth(
    'info',
    `[Q3-3-2] 点击Y值最大的"转发" @ (${forwardInList.centerX}, ${forwardInList.centerY})`
  );
  // P+ 拟人化：关键 tap 前迟疑 + ±5px 偏移
  await maybePause();
  await humanTap(forwardInList.centerX, forwardInList.centerY);
  await zbbAutomation.delay(pGammaDelay(2000, 3000));

  // Q3-3-3：识别分享页，找"复制"按钮，点击
  const nodes3 = await zbbAutomation.getAllTextNodes();
  logToBoth('info', `[Q3-3-3] 分享页 (${nodes3.length}个节点)`);
  const copyBtn = nodes3.find((n) => n.text === '复制');
  if (!copyBtn) {
    logToBoth('warn', '[Q3-3-3] 未找到"复制"按钮');
    return { ok: true, data: undefined };
  }
  logToBoth('info', `[Q3-3-3] 点击"复制" @ (${copyBtn.centerX}, ${copyBtn.centerY})`);
  // P+ 拟人化：关键 tap 前迟疑 + ±5px 偏移
  await maybePause();
  await humanTap(copyBtn.centerX, copyBtn.centerY);
  await zbbAutomation.delay(pGammaDelay(1000, 1500));

  // Q3-4：从原生树节点解析客户信息（数据出口 — 写到 ctx.customerInfo + 系统剪贴板）
  // 因 ZBB 读不到千机的剪贴板（系统权限隔离），
  // 改用 ctx.lastTextNodes（Q2 抓的"报备审核"页节点）
  const nodeText = assembleKeyValueLines(ctx.lastTextNodes);
  logToBoth(
    'info',
    `[Q3-4] 节点拼装后(${ctx.lastTextNodes.length}个原始节点):\n${nodeText.substring(0, 800)}`
  );
  if (nodeText.trim()) {
    const parsed = parseClipboardText(nodeText);
    if (parsed) {
      ctx.customerInfo = { ...ctx.customerInfo, ...parsed } as QianjiContext['customerInfo'];
      if (ctx.customerInfo!.phone) {
        const phoneLast4 = ctx.customerInfo!.phone.replace(/\*/g, '').slice(-4);
        ctx.customerInfo = { ...ctx.customerInfo!, phoneLast4 };
      }
      logToBoth(
        'info',
        `[Q3-4] 解析结果: 客户=${ctx.customerInfo!.customerName || '(空)'} 电话=${ctx.customerInfo!.phone || '(空)'} 经纪人=${ctx.customerInfo!.agent || '(空)'} 经纪人电话=${ctx.customerInfo!.agentPhone || '(空)'} 城市=${ctx.customerInfo!.city || '(空)'} 报备时间=${ctx.customerInfo!.reportTime || '(空)'}`
      );
    } else {
      logToBoth('warn', '[Q3-4] 节点解析无结果（格式不匹配）');
    }
  } else {
    logToBoth('warn', '[Q3-4] 节点为空，无法解析');
  }

  return { ok: true, data: undefined };
};