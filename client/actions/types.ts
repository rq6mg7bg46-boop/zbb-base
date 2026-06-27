// client/actions/types.ts
// v2 Action 层公共类型定义（v2 设计文档 §5.2）

/**
 * Action 输入目标 - 描述"我要操作哪个节点"
 * - text:  按文本查找（includes 匹配）
 * - coord: 按坐标点击（dp=true 时为 dp 坐标，自动归一化）
 * - desc:  按 content-desc 查找
 */
export type NodeTarget =
  | { kind: 'text'; text: string }
  | { kind: 'coord'; x: number; y: number; dp?: boolean }
  | { kind: 'desc'; desc: string };

/**
 * Action 返回结果 - 统一格式
 * - ok:     是否成功
 * - data?:  成功时携带的数据（如 findText 返回节点）
 * - error?: 失败时携带的错误
 */
export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: ActionError;
}

/**
 * Action 错误 - typed error，不静默失败（v2 设计文档 §P1）
 */
export class ActionError extends Error {
  constructor(
    public readonly actionName: string,
    public readonly cause: unknown,
    message?: string
  ) {
    super(message ?? `Action "${actionName}" failed: ${String(cause)}`);
    this.name = 'ActionError';
  }
}