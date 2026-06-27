// client/workflows/qianji/qianjiCollectWorkflow.ts
// 千机客户收集 workflow（v2 设计文档 §3 + §7 + W3 迁移 + 2026-06-28 编号重构）

import { workflow, step } from '@/engine';
import { openQianjiStep } from './steps/open';
import { recognizeInterfaceStep } from './steps/recognize';
import { findCustomerStep } from './steps/find';
import { jumpToReportAppStep } from './steps/jump';

/**
 * qianjiCollectWorkflow - 千机客户收集 workflow
 *
 * 千机端 = 数据统一出口，编号 Q1-Q5（对应 v2 设计文档 §3）：
 *   Q1 = stepOpenQianji           启动千机 App
 *   Q2 = stepRecognizeInterface   识别界面 + 预检查待报备
 *   Q3 = stepFindAndCollectCustomer  找"报备审核" + 转发 3 步 + 解析（数据出口 Q3-4）
 *   Q4 = stepJumpToReportApp      跳下游（v1.6.4 同步调 baoliService.execute()）
 *                                  C5 派发抽象后改 Q5 + ctx.dispatch()
 *
 * 下游各端独立编号（与千机解耦）：
 *   保利 P1-P15
 *   越秀 Y1-YM（未来）
 *   其他 O1-OO（未来）
 *
 * GO 兜底配置：
 *   - Q1（开千机）：启动失败 → abort（用户手动开）
 *   - Q2（识别界面）：待报备为 0 → abort（lastExitReason='no_pending'，业务退出）
 *   - Q3（找客户）：找不到"报备审核" → continue（继续等下次接龙）
 *   - Q5（派发下游）：关键路径，无 GO 兜底（同步调下游）
 */
export const qianjiCollectWorkflow = workflow({
  name: 'qianji.collectCustomer',
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
        action: 'continue', // 找不到不重试，继续等下次接龙
      },
    }),
    step('q5_dispatch', jumpToReportAppStep),
  ],
});