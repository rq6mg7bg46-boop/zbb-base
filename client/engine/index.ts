// client/engine/index.ts
// Step 引擎统一导出（v2 设计文档 §5.3-5.5 + §6.2）

// ========== 类型 ==========
export type {
  Action,
  StepFn,
  Step,
  GoOnFailConfig,
  WorkflowState,
  WorkflowEvent,
  WorkflowContext,
  Workflow,
  WorkflowResult,
} from './types';

// ========== 编排三件套 ==========
export { pipe, sequence, parallel } from './step';

// ========== 构造器 ==========
export { step, workflow } from './workflow';

// ========== 执行器 ==========
export { runWorkflow } from './executor';

// ========== GO 机制 ==========
export { waitForUserGo, withGoOnFail } from './go';