// client/workflows/qianji/qianjiReturnWorkflow.ts
// 千机端 Q6/Q7 返回工作流（v2 设计文档 §5.5 + W7 老板拍板）
// 触发：ON_BAOLI_LAUNCH_DONE event → QianjiService 订阅 → startQianjiReturnV2() 调本 workflow
// 范围：Q6 返回千机 + Q7 GO 按钮 + 退出小程序
// 不含：循环接龙（detectNextGroup，老 v1.6.4 保留为 fallback）

import { workflow, step } from '@/engine';
import { returnToQianjiStep } from './steps/returnToQianji';
import { showGoAndWaitStep } from './steps/showGoAndWait';

export const qianjiReturnWorkflow = workflow({
  name: 'qianji.return',
  steps: [
    step('q6_returnToQianji', returnToQianjiStep, {
      goOnFail: {
        reason: '返回千机失败',
        hint: '请检查千机 app 状态',
        action: 'continue',
      },
    }),
    step('q7_showGoAndWait', showGoAndWaitStep, {
      goOnFail: {
        reason: 'GO 按钮等待失败',
        hint: '请检查 GO 按钮是否显示',
        action: 'continue',
      },
    }),
  ],
});
