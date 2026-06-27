// client/workflows/qianji/steps/recognize.ts
// 千机步骤 2：识别当前界面 + 预检查待报备数量
// 来源：QianjiService.ts stepRecognizeInterface L199-281

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';
import type { QianjiContext } from '../types';
import { pGammaDelay } from '../utils';

/**
 * recognizeInterfaceStep - 千机步骤 2
 * 1. Gamma 分布等待 2000-3000ms 界面加载
 * 2. 抓取并过滤 text nodes
 * 3. 预检查待报备数量（最多 3 次：初始 + 2 次下拉后）
 * 4. 连续 0 → Toast 提示 + pressHome + 设置 lastExitReason='no_pending'
 */
export const recognizeInterfaceStep: StepFn<QianjiContext, void> = async (ctx) => {
  logToBoth('info', '[千机：步骤2] 正在识别当前界面...');

  // 等待界面加载（P+ 拟人化：Gamma 分布 2000-3000ms）
  await zbbAutomation.delay(pGammaDelay(2000, 3000));

  // 获取所有文本节点
  const textNodes = await zbbAutomation.getAllTextNodes();

  logToBoth('info', `[千机：步骤2] === 界面文本节点 (共 ${textNodes.length} 个) ===`);

  // 过滤并输出有效节点
  const validNodes = textNodes.filter(
    (node) => node.text && node.text.trim().length > 0 && node.centerX > 0 && node.centerY > 0
  );

  validNodes.forEach((node, index) => {
    logToBoth(
      'info',
      `[千机：步骤2] ${index + 1}. "${node.text}" at (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`
    );
  });

  if (validNodes.length === 0) {
    logToBoth('warn', '[千机：步骤2] 未识别到任何文本节点');
  }

  logToBoth('success', `[千机：步骤2] ✓ 界面识别完成`);

  // 保存到 ctx 供后续步骤使用（替代 this.lastTextNodes）
  ctx.lastTextNodes = validNodes;

  // ========== 预检查待报备数量（最多 3 次：初始 + 2 次下拉后） ==========
  let pendingCount = '0';
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      // 下拉刷新：坐标 (540,400)→(540,1500)，300-500ms 随机
      const swipeDuration = 300 + Math.floor(Math.random() * 200);
      logToBoth('info', `[千机：步骤2] 第 ${attempt} 次下拉刷新 (duration=${swipeDuration}ms)...`);
      await zbbAutomation.swipe(540, 400, 540, 1500, swipeDuration);
      // 下拉后等（Gamma 分布 1000-2000ms）
      await zbbAutomation.delay(pGammaDelay(1000, 2000));

      // 重新抓节点（覆盖 ctx.lastTextNodes）
      ctx.lastTextNodes = (await zbbAutomation.getAllTextNodes()).filter(
        (node) => node.text && node.text.trim().length > 0 && node.centerX > 0 && node.centerY > 0
      );
      logToBoth('info', `[千机：步骤2] 第 ${attempt} 次刷新后节点 (共 ${ctx.lastTextNodes.length} 个)`);
    }

    // 找 (107, 680) 数字：主匹配 ±5px；fallback 找"报备待审核"(183,575)和"今日报备量"(168,769)之间的纯数字节点
    const pendingNode = ctx.lastTextNodes.find(
      (n) =>
        (Math.abs(n.centerX - 107) < 5 && Math.abs(n.centerY - 680) < 5) ||
        (n.centerY > 575 && n.centerY < 769 && /^\d+$/.test(n.text))
    );
    pendingCount = pendingNode?.text || '0';
    logToBoth('info', `[千机：步骤2] 第 ${attempt} 次检查 待报备数量 = ${pendingCount}`);

    if (pendingCount !== '0') {
      logToBoth('success', `[千机：步骤2] 有待报备客户 (${pendingCount})，继续执行后续步骤`);
      break;
    }
  }

  // 3 次都 0 → Toast 提示 + 按 Home 返回桌面
  if (pendingCount === '0') {
    logToBoth('warn', '[千机：步骤2] 连续 3 次检查待报备数量为 0');
    void zbbAutomation.showToast('当前无报备');
    // 接龙循环退出标志：testOnlyQianjiFlow 读到会返回 'no_pending'
    ctx.lastExitReason = 'no_pending';
    await zbbAutomation.pressHome();
    // 不抛错（保留老行为，executor 视作 ok 继续，但 lastExitReason 已设置）
    return { ok: true, data: undefined };
  }

  // 注：千机端不通过原生树读取客户信息，统一从转发剪贴板获取（步骤3-4）
  return { ok: true, data: undefined };
};