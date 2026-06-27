// client/workflows/baoli/baoliFillFormWorkflow.ts
// 保利端填表 workflow（v2 设计文档 §3 + W5 迁移）
// 范围：1 轮填表 P8-P15（8 步）
// 不含：P16 结果检测（BaoliService.detectResult）+ 第 2 轮（BaoliService.handleSecondRound）

import { workflow, step } from '@/engine';
import { pasteCustomerInfoStep } from './steps/paste';
import { waitForRenderStep } from './steps/render';
import { parseFormNodesStep } from './steps/parse';
import { selectInstallmentStep } from './steps/checkEntry';
import { selectProjectStep } from './steps/selectProject';
import { tapConfirmStep } from './steps/confirm';
import { tapAiRecognizeStep } from './steps/aiRecognize';
import { tapReportFormStep } from './steps/clickReportForm';
import { waitReportResultStep } from './steps/waitResult';

/**
 * 保利端填表 workflow（8 步：P8-P15）
 *
 * 调用方：BaoliService.startBaoliFillFormV2(round, projectName)
 * 跑完一轮：BaoliService 决定是否跑第 2 轮（老 handleSecondRound）
 * 结果检测：BaoliService.detectResult()（保留老方法，W5 阶段不迁）
 *
 * 关键设计（v2 设计文档 §3 + W5 老板拍板）：
 *   P8  = pasteCustomerInfoStep   找输入框 + 长按 + tap 粘贴
 *   P9a = waitForRenderStep       等渲染 + 抓 formNodes
 *   P9b = parseFormNodesStep      解析 9 字段 + 兜底性别
 *   P10 = selectInstallmentStep   入口检测 + 点分期
 *   P11 = selectProjectStep       选报备项目（ctx.projectName）
 *   P12 = tapConfirmStep          点确认
 *   P13 = tapAiRecognizeStep      智能识别
 *   P14 = tapReportFormStep       点报备
 *   P15 = waitReportResultStep    等报备结果（3-6 秒）
 *
 * 注：P9 拆 2 step（render 等渲染 + parse 解析字段）符合 v2 单职责原则
 */
export const baoliFillFormWorkflow = workflow({
  name: 'baoli-fill-form',
  steps: [
    step('p8_pasteCustomerInfo', pasteCustomerInfoStep),
    step('p9a_waitForRender', waitForRenderStep),
    step('p9b_parseFormNodes', parseFormNodesStep),
    step('p10_selectInstallment', selectInstallmentStep),
    step('p11_selectProject', selectProjectStep),
    step('p12_tapConfirm', tapConfirmStep),
    step('p13_tapAiRecognize', tapAiRecognizeStep),
    step('p14_tapReportForm', tapReportFormStep),
    step('p15_waitReportResult', waitReportResultStep),
  ],
});
