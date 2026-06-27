// client/workflows/baoli/baoliLaunchWorkflow.ts
// 保利端启动 workflow（v2 设计文档 §3 保利端 P1-P7 + W4 迁移）

import { workflow, step } from '@/engine';
import { pressHomeToDesktopStep } from './steps/home';
import { launchWechatWorkStep } from './steps/launch';
import { tapWorkbenchStep } from './steps/workbench';
import { findCloudHomeStep } from './steps/cloudHome';
import { findProjectStep } from './steps/findProject';
import { enterFormStep } from './steps/enterForm';
import { clickReportStep } from './steps/clickReport';
import type { BaoliContext } from './types';

/**
 * 保利端启动 workflow（7 步：P1-P7）
 *
 * 调用方：BaoliService.startBaoliLaunchV2()（W4 接入）
 * 老入口：BaoliService.execute()（保留 fallback）
 *
 * 关键设计（v2 设计文档 §3 + 老板 06-28 拍板）：
 *   P1 = pressHomeToDesktopStep      按 Home 退出到桌面
 *   P2 = launchWechatWorkStep        识别企微 + 启动
 *   P3 = tapWorkbenchStep            点击"工作台"
 *   P4 = findCloudHomeStep           上滑找"云和家经纪云"
 *   P5 = findProjectStep             找"郑州保利山水和颂"
 *   P6 = enterFormStep               进入填表流程
 *   P7 = clickReportStep             点击"报备"
 *
 * 注：P8-P15 填表段 + P16 检测分支保留在 BaoliService 内部（fillForm/detectResult），
 *     W4 阶段不迁子流程（与 W3 千机迁启动段同款）
 */
export const baoliLaunchWorkflow = workflow({
  name: 'baoli-launch',
  steps: [
    step('p1_pressHomeToDesktop', pressHomeToDesktopStep),
    step('p2_launchWechatWork', launchWechatWorkStep),
    step('p3_tapWorkbench', tapWorkbenchStep),
    step('p4_findCloudHome', findCloudHomeStep),
    step('p5_findProject', findProjectStep),
    step('p6_enterForm', enterFormStep),
    step('p7_clickReport', clickReportStep),
  ],
});
