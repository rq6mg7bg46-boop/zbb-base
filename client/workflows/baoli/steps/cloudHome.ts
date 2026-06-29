// client/workflows/baoli/steps/cloudHome.ts
// 保利 P4：上滑最多 15 次 → 查找"云和家经纪云"
// 来源：BaoliService.ts execute() L278-311
// 第一批优化 J：先 find 1 次（retries=1），找不到才上滑；上滑最多 15 次

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { humanTap, humanSwipeWithBounce, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P4：上滑最多 15 次 → 查找"云和家经纪云"
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
      // 老板 2026-06-28 调整：起点 y 1800 → 1400（避免 vivo 上滑触发底部导航条）
      await humanSwipeWithBounce(540, 1400, 540, 600, 800);
      // 老板 2026-06-28 调整：固定 1500ms 改为 Gamma 分布 1000-2500ms（更拟人 + 不规则节奏）
      await zbbAutomation.delay(pGammaDelay(1000, 2500));
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
    const fallback = await getTapCoord('cloudHome');
    logToBoth('warn', '[P4] 未找到"云和家经纪云"，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型)');
    await humanTap(fallback.x, fallback.y);
  }

  // 第一批优化 A：等云和家小程序加载（9s → 3s）
  await zbbAutomation.delay(3000);
  maybePause();
  return { ok: true };
};
