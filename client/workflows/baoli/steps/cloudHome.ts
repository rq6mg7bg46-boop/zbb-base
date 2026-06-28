// client/workflows/baoli/steps/cloudHome.ts
// 保利 P4：上滑 4 次 → 查找"云和家经纪云"
// 来源：BaoliService.ts execute() L278-311
// 第一批优化 J：先 find 1 次（retries=1），找不到才上滑；上滑最多 15 次

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap, humanSwipeWithBounce } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P4：上滑 4 次 → 查找"云和家经纪云"
 * - 第一次直接 find，找不到才上滑
 * - 上滑最多 15 次
 * - 都找不到 → 兜底坐标 (668, 1502)
 */
export const findCloudHomeStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P4] 上滑查找"云和家经纪云"...');
  let found = false;
  let cloudNode = await ctx.baoliService.findNodeByText('云和家经纪云', 1);
  if (cloudNode) {
    logToBoth('success', '[P4] 找到"云和家经纪云" @ (' + cloudNode.centerX + ', ' + cloudNode.centerY + ')');
    await humanTap(cloudNode.centerX, cloudNode.centerY);
    found = true;
  } else {
    for (let i = 0; i < 15; i++) {
      // P+ 拟人化滚动：手指惯性 overshoot + 回弹
      await humanSwipeWithBounce(540, 1800, 540, 600, 800);
      await zbbAutomation.delay(1500);
      cloudNode = await ctx.baoliService.findNodeByText('云和家经纪云', 1);
      if (cloudNode) {
        logToBoth('success', '[P4] 上滑 ' + (i + 1) + ' 次后找到 @ (' + cloudNode.centerX + ', ' + cloudNode.centerY + ')');
        await humanTap(cloudNode.centerX, cloudNode.centerY);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    logToBoth('warn', '[P4] 未找到"云和家经纪云"，使用备用坐标 (668, 1502)');
    await humanTap(668, 1502);
  }

  // 第一批优化 A：等云和家小程序加载（9s → 3s）
  await zbbAutomation.delay(3000);
  maybePause();
  return { ok: true };
};
