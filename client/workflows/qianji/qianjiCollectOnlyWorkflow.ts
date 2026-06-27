// client/workflows/qianji/qianjiCollectOnlyWorkflow.ts
// 千机接龙专用 3 步 workflow（不派发下游，对应 v1.6.4 testOnlyQianjiFlow）

import { workflow, step } from '@/engine';
import { openQianjiStep } from './steps/open';
import { recognizeInterfaceStep } from './steps/recognize';
import { findCustomerStep } from './steps/find';

/**
 * qianjiCollectOnlyWorkflow - 千机接龙 workflow（只跑 Q1-Q3，不调 Q5 派发）
 *
 * 千机端 Q1-Q3 = 数据收集：
 *   Q1 = stepOpenQianji           启动千机 App
 *   Q2 = stepRecognizeInterface   识别界面 + 预检查待报备
 *   Q3 = stepFindAndCollectCustomer  找"报备审核" + 转发 + 解析（数据出口）
 *
 * 对应 v1.6.4 QianjiService.testOnlyQianjiFlow()：
 *   不跑 Q5 派发（否则会无限循环）— 接龙循环只检查是否有客户可报备
 *
 * GO 兜底配置同 qianjiCollectWorkflow
 */
export const qianjiCollectOnlyWorkflow = workflow({
  name: 'qianji.collectOnly',
  steps: [
    step('q1_openQianji', openQianjiStep, {
      goOnFail: {
        reason: '千机启动失败',
        hint: '请检查千机是否安装并启用无障碍',
        action: 'abort',
      },
    }),
    step('q2_recognizeInterface', recognizeInterfaceStep, {
      goOnFail: {
        reason: '千机界面识别失败',
        hint: '请检查千机 app 状态',
        action: 'abort',
      },
    }),
    step('q3_findCustomer', findCustomerStep, {
      goOnFail: {
        reason: '找不到"报备审核"',
        hint: '请手动下拉刷新',
        action: 'continue', // 找不到不重试
      },
    }),
  ],
});