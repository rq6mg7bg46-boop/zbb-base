// client/workflows/qianji/types.ts
// 千机 workflow 共享类型（v2 设计文档 §7 数据流 + W3 迁移）

import type { WorkflowContext } from '@/engine';

/**
 * 千机端客户信息结构
 * 对应千机剪贴板解析后的 KV 字段
 * 来源：stepFindAndCollectCustomer L283+ 解析 text nodes
 */
export interface QianjiCustomerInfo {
  /** 客户姓名 */
  name: string;
  /** 客户电话 */
  phone: string;
  /** 备用扩展字段（千机自定义 KV） */
  [key: string]: string;
}

/**
 * 千机端 workflow 上下文
 * 继承通用 WorkflowContext + 千机专属字段
 */
export interface QianjiContext extends WorkflowContext {
  /**
   * 当前正在处理的客户信息
   * 步骤 1-2：null（开 APP + 识别界面）
   * 步骤 3：被填充（findCustomer 解析后写入）
   * 步骤 4：携带 customerInfo 调 BaoliService.execute()
   */
  customerInfo: QianjiCustomerInfo | null;
}

/**
 * 千机界面识别结果
 * 来源：stepRecognizeInterface L199+ 的 OCR + 文字节点匹配
 */
export type QianjiInterfaceState =
  | 'main_list'         // 千机主页（待报备客户列表）
  | 'customer_detail'   // 客户详情页
  | 'submitted'         // 已报备（保利报备完成后回千机点击"已报备"）
  | 'unknown';          // 无法识别

/**
 * 千机界面识别结果
 */
export interface QianjiInterfaceResult {
  state: QianjiInterfaceState;
  /** 客户详情页的 text 节点列表（findCustomer 用） */
  textNodes: Array<{ text: string; bounds: { left: number; top: number; right: number; bottom: number } }>;
}