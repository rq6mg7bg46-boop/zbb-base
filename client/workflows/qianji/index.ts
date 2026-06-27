// client/workflows/qianji/index.ts
// 千机 workflow 统一导出（W3 + W7 累计）

export { qianjiCollectWorkflow } from './qianjiCollectWorkflow';
export { qianjiCollectOnlyWorkflow } from './qianjiCollectOnlyWorkflow';
export { qianjiReturnWorkflow } from './qianjiReturnWorkflow';
export { openQianjiStep } from './steps/open';
export { recognizeInterfaceStep } from './steps/recognize';
export { findCustomerStep } from './steps/find';
export { jumpToReportAppStep } from './steps/jump';
export { returnToQianjiStep } from './steps/returnToQianji';
export { showGoAndWaitStep } from './steps/showGoAndWait';
export type { QianjiContext, QianjiCustomerInfo, QianjiInterfaceResult, QianjiInterfaceState } from './types';