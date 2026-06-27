// client/workflows/qianji/qianjiCollectOnlyWorkflow.ts
// 千机接龙专用 3 步 workflow（不触发保利，对应 v1.6.4 testOnlyQianjiFlow）

import { workflow, step } from '@/engine';
import { openQianjiStep } from './steps/open';
import { recognizeInterfaceStep } from './steps/recognize';
import { findCustomerStep } from './steps/find';

/**
 * qianjiCollectOnlyWorkflow - 千机接龙 3 步工作流
 *
 * 对应 v1.6.4 QianjiService.testOnlyQianjiFlow()：
 *   step1 = stepOpenQianji
 *   step2 = stepRecognizeInterface
 *   step3 = stepFindAndCollectCustomer
 *   （不调 step4 jumpToReportApp，否则会无限循环）
 *
 * GO 兜底配置同 qianjiCollectWorkflow（4 步），只是不包含 jump
 */
export const qianjiCollectOnlyWorkflow = workflow({
  name: 'qianji.collectOnly',
  steps: [
    step('openQianji', openQianjiStep, {
      goOnFail: {
        reason: '千机启动失败',
        hint: '请检查千机是否安装并启用无障碍',
        action: 'abort',
      },
    }),
    step('recognizeInterface', recognizeInterfaceStep, {
      goOnFail: {
        reason: '千机界面识别失败',
        hint: '请检查千机 app 状态',
        action: 'abort',
      },
    }),
    step('findCustomer', findCustomerStep, {
      goOnFail: {
        reason: '找不到"报备审核"',
        hint: '请手动下拉刷新',
        action: 'continue', // 找不到不重试
      },
    }),
  ],
});