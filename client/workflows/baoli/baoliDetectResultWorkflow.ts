// client/workflows/baoli/baoliDetectResultWorkflow.ts
// 保利端 P16 检测报备结果 workflow（v2 设计文档 §3 + W9 老板拍板）
// 范围：3 step（P16a 检测重号 + P16b 检测成功 + P16c 超时重试）
// 替代：BaoliService.ts detectResult() 老方法（W9 阶段删除）

import { workflow, step } from '@/engine';
import { detectRepeatStep } from './steps/detectRepeat';
import { detectSuccessStep } from './steps/detectSuccess';
import { detectTimeoutStep } from './steps/detectTimeout';

/**
 * 保利端 P16 检测报备结果 workflow（3 step）
 *
 * 调用方：BaoliService.startBaoliFillFormV2(round, projectName) 末尾
 * 调用方：BaoliService.handleSecondRound() 末尾
 *
 * 关键设计（W9 老板拍板）：
 *   P16a = detectRepeatStep    检测疑似重号 → ctx.detectState = 'repeat'
 *   P16b = detectSuccessStep   检测报备成功 → ctx.detectState = 'success'
 *   P16c = detectTimeoutStep   30s 重试 → 命中设状态 / 跑完设 timeout
 *
 * 检测结果通过 ctx.detectState 传递：
 *   'pending' → 'repeat' / 'success' / 'timeout'
 *
 * 调用方根据 ctx.detectState 决定：
 *   'repeat' → ctx.baoliService.handleRepeatCase()
 *   'success' → ctx.baoliService.handleSuccessCase(ctx.round)
 *   'timeout' → 流程结束，保持当前界面（Toast 提示已发）
 */
export const baoliDetectResultWorkflow = workflow({
  name: 'baoli-detect-result',
  steps: [
    step('p16a_detectRepeat', detectRepeatStep),
    step('p16b_detectSuccess', detectSuccessStep),
    step('p16c_detectTimeout', detectTimeoutStep),
  ],
});