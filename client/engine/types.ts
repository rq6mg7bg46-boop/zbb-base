// client/engine/types.ts
// Step 引擎公共类型（v2 设计文档 §5.3-5.5 + §6.2）

import type { ActionResult } from '@/actions';

/**
 * Action 函数签名：接收输入（来自前一步 result.data），返回 ActionResult
 * - TIn:  输入类型（void = 无输入）
 * - TOut: 输出类型（void = 无输出）
 */
export type Action<TIn = void, TOut = void> = TIn extends void
  ? (input?: TIn) => Promise<ActionResult<TOut>>
  : (input: TIn) => Promise<ActionResult<TOut>>;

/**
 * Step 函数签名：接收 input，返回 ActionResult
 * - 抛错时由 executor 捕获走 GO 兜底
 * - 返回 ok=false 时同样走 GO 兜底（比抛错更友好：调用方不用 try/catch）
 */
export type StepFn<TIn = void, TOut = void> = (input: TIn) => Promise<ActionResult<TOut>>;

/**
 * GO 失败兜底配置（v2 设计文档 §6.2 + 老板 06-26 "通用失败恢复"机制）
 */
export interface GoOnFailConfig {
  /** 用户看到的第一行（必填） */
  reason: string;
  /** 用户看到的第二行操作提示（必填） */
  hint: string;
  /** GO 后行为：retry（默认）/ continue / abort */
  action?: 'retry' | 'continue' | 'abort';
  /** retry 最大次数（默认 3） */
  maxRetries?: number;
}

/**
 * 构造后的 Step（workflow.ts 用）
 */
export interface Step {
  /** 步骤名（debug + 日志用） */
  name: string;
  /** 执行函数 */
  fn: StepFn<unknown, unknown>;
  /** GO 失败兜底（可选，未声明 = 不兜底直接抛错） */
  goOnFail?: GoOnFailConfig;
}

/**
 * Workflow 状态机（v2 设计文档 §5.4 + P4 状态机显式化）
 */
export type WorkflowState =
  | 'idle'
  | 'running'
  | 'paused'           // GO 等待用户
  | 'stepFailed'       // 单步失败
  | 'completed'
  | 'aborted';

/**
 * Workflow 状态转换事件
 */
export type WorkflowEvent =
  | { type: 'stepStart'; stepName: string }
  | { type: 'stepEnd'; stepName: string; ok: boolean }
  | { type: 'goPause'; reason: string }
  | { type: 'goResume'; action: 'retry' | 'continue' | 'abort' }
  | { type: 'stepFail'; stepName: string; error: unknown }
  | { type: 'workflowEnd'; state: WorkflowState };

/**
 * Workflow 上下文（跨步骤共享数据 + 日志 + GO 状态）
 */
export interface WorkflowContext {
  /** 步骤间共享数据（剪贴板桥接内容、节点缓存等） */
  data: Record<string, unknown>;
  /** 当前步骤索引（executor 维护） */
  stepIndex: number;
  /** 当前状态（executor 维护） */
  state: WorkflowState;
  /** 日志回调（executor 注入） */
  log: (level: 'info' | 'warn' | 'error' | 'success', msg: string) => void;
  /** 等待用户 GO（executor 注入，go.ts 实现） */
  waitForGo: (reason: string, hint: string) => Promise<void>;
}

/**
 * Workflow 定义（v2 设计文档 §5.4）
 */
export interface Workflow {
  /** workflow 名称（debug + 日志） */
  name: string;
  /** 初始状态（默认 'idle'） */
  initialState?: WorkflowState;
  /** 步骤列表（按顺序执行） */
  steps: Step[];
  /** 完成态（默认 'completed'） */
  finalState?: WorkflowState;
}

/**
 * Workflow 执行结果
 */
export interface WorkflowResult {
  ok: boolean;
  state: WorkflowState;
  error?: unknown;
  /** 成功时记录每个步骤结果 */
  stepResults?: Array<{ name: string; ok: boolean; error?: unknown }>;
}