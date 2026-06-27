// client/workflows/qianji/index.ts
// 千机 workflow 统一导出

export { qianjiCollectWorkflow } from './qianjiCollectWorkflow';
export { qianjiCollectOnlyWorkflow } from './qianjiCollectOnlyWorkflow';
export { openQianjiStep } from './steps/open';
export { recognizeInterfaceStep } from './steps/recognize';
export { findCustomerStep } from './steps/find';
export { jumpToReportAppStep } from './steps/jump';
export type { QianjiContext, QianjiCustomerInfo, QianjiInterfaceResult, QianjiInterfaceState } from './types';
export {
  getDelay,
  pGammaDelay,
  humanTap,
  humanSwipeWithBounce,
  parseClipboardText,
  assembleKeyValueLines,
  ParsedCustomerInfo,
} from './utils';
// maybePause 来自 @/actions（不重新导出，老 import @/actions.maybePause 仍可用）