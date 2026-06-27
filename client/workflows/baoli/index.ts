// client/workflows/baoli/index.ts
// 保利 workflow 统一导出（W4 起步）

export { baoliLaunchWorkflow } from './baoliLaunchWorkflow';
export type { BaoliContext, BaoliInterfaceState } from './types';
export { getDelay, humanTap, pGammaDelay, humanSwipeWithBounce, BAOLI_DELAY_CONFIG } from './utils';

// Step 导出（v1.6.4 老调用方可能用到）
export { pressHomeToDesktopStep } from './steps/home';
export { launchWechatWorkStep } from './steps/launch';
export { tapWorkbenchStep } from './steps/workbench';
export { findCloudHomeStep } from './steps/cloudHome';
export { findProjectStep } from './steps/findProject';
export { enterFormStep } from './steps/enterForm';
export { clickReportStep } from './steps/clickReport';
