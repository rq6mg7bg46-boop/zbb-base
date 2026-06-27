// client/workflows/qianji/qianjiCollectWorkflow.ts
// 千机客户收集 workflow（v2 设计文档 §3 + §7 + W3 迁移）

import { workflow, step } from '@/engine';
import { openQianjiStep } from './steps/open';
import { recognizeInterfaceStep } from './steps/recognize';
import { findCustomerStep } from './steps/find';
import { jumpToReportAppStep } from './steps/jump';

/**
 * qianjiCollectWorkflow - 千机客户收集 4 步工作流
 *
 * 对应 v1.6.4 QianjiService.startQianjiFlow()：
 *   step1 = stepOpenQianji
 *   step2 = stepRecognizeInterface
 *   step3 = stepFindAndCollectCustomer
 *   step4 = stepJumpToReportApp
 *
 * GO 兜底配置：
 *   - 步骤 1（开千机）：启动失败 → abort（用户手动开）
 *   - 步骤 2（识别界面）：待报备为 0 → abort（lastExitReason='no_pending'，业务退出）
 *   - 步骤 3（找客户）：找不到"报备审核" → retry 3 次 → continue（继续等下次）
 *   - 步骤 4（跳保利）：关键路径，无 GO 兜底
 */
export const qianjiCollectWorkflow = workflow({
  name: 'qianji.collectCustomer',
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
        action: 'continue', // 找不到不重试，继续等下次接龙
      },
    }),
    step('jumpToReportApp', jumpToReportAppStep),
  ],
});