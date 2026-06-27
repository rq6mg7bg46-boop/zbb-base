// client/workflows/baoli/index.ts
// 保利 workflow 统一导出（W4 + W5 + W9 累计）

export { baoliLaunchWorkflow } from './baoliLaunchWorkflow';
export { baoliFillFormWorkflow } from './baoliFillFormWorkflow';
// W9 P16 检测报备结果 workflow（替代老 BaoliService.detectResult）
export { baoliDetectResultWorkflow } from './baoliDetectResultWorkflow';
export type { BaoliContext, BaoliInterfaceState } from './types';
export { getDelay, humanTap, pGammaDelay, humanSwipeWithBounce, BAOLI_DELAY_CONFIG } from './utils';

// Step 导出（v1.6.4 老调用方可能用到）
// 启动段 P1-P7
export { pressHomeToDesktopStep } from './steps/home';
export { launchWechatWorkStep } from './steps/launch';
export { tapWorkbenchStep } from './steps/workbench';
export { findCloudHomeStep } from './steps/cloudHome';
export { findProjectStep } from './steps/findProject';
export { enterFormStep } from './steps/enterForm';
export { clickReportStep } from './steps/clickReport';
// 填表段 P8-P15（W5 新增）
export { pasteCustomerInfoStep } from './steps/paste';
export { waitForRenderStep } from './steps/render';
export { parseFormNodesStep } from './steps/parse';
export { selectInstallmentStep } from './steps/checkEntry';
export { selectProjectStep } from './steps/selectProject';
export { tapConfirmStep } from './steps/confirm';
export { tapAiRecognizeStep } from './steps/aiRecognize';
export { tapReportFormStep } from './steps/clickReportForm';
export { waitReportResultStep } from './steps/waitResult';
