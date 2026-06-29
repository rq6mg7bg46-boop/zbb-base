// client/workflows/baoli/steps/launch.ts
// 保利 P2：识别桌面企业微信图标 + 启动
// 来源：BaoliService.ts execute() L249-262

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { delay, maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { getDelay, humanTap } from '../utils';
import type { BaoliContext } from '../types';

// 兜底启动用（v1.6.4 内部 const，W4 阶段复制避免跨文件依赖）
const APP_PACKAGES = {
  WECHAT: 'com.tencent.wework',  // 企业微信
  WECHAT_MAIN_ACTIVITY: 'com.tencent.wework.ui.index.WwMainActivity',
};

/**
 * P2：识别桌面企业微信图标
 * - 找到 → 点击
 * - 未找到 → 兜底 launchAppWithMonkey 直接启动
 */
export const launchWechatWorkStep: StepFn<BaoliContext, void> = async () => {
  logToBoth('info', '[P2] 识别桌面企业微信图标...');
  const wechatNode = await zbbAutomation.findNodeCenterByText('企业微信');
  if (wechatNode) {
    logToBoth('success', '[P2] 找到"企业微信" @ (' + wechatNode.centerX + ', ' + wechatNode.centerY + ')');
    await humanTap(wechatNode.centerX, wechatNode.centerY);
  } else {
    logToBoth('error', '[P2] 未在桌面找到"企业微信"图标，尝试直接启动');
    await zbbAutomation.launchAppWithMonkey(
      APP_PACKAGES.WECHAT,
      APP_PACKAGES.WECHAT_MAIN_ACTIVITY
    );
  }
  await delay(getDelay('openApp'));
  maybePause();
  return { ok: true };
};
