// client/workflows/qianji/types.ts
// 千机 workflow 共享类型（v2 设计文档 §7 数据流 + W3 迁移）

import type { WorkflowContext } from '@/engine';

/**
 * 千机端客户信息结构
 * 对应千机剪贴板解析后的 KV 字段
 * 来源：stepFindAndCollectCustomer L283+ 解析 text nodes
 */
export interface QianjiCustomerInfo {
  /** 客户姓名（兼容旧字段名 customerName） */
  name?: string;
  customerName?: string;
  /** 客户电话 */
  phone: string;
  /** 经纪人姓名 */
  agent?: string;
  /** 经纪人电话（2026-06-20 老板拍板：经纪人含电话要分离） */
  agentPhone?: string;
  /** 报备项目类型（baoli/yuexiu） */
  projectType?: 'baoli' | 'yuexiu' | string;
  /** 报备提交时间 */
  reportTime?: string;
  /** 预计到访时间 */
  expectedVisitTime?: string;
  /** 售卖城市 */
  city?: string;
  /** 电话后 4 位（去 *） */
  phoneLast4?: string;
  /** 备用扩展字段（千机自定义 KV） */
  [key: string]: string | undefined;
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

  /**
   * 上次抓取的 text nodes（recognize 步骤写入，find 步骤消费）
   * 对应 QianjiService.ts this.lastTextNodes
   * 类型：zbbAutomation.getAllTextNodes() 返回的 TextNode[]
   */
  lastTextNodes: Array<{
    text: string;
    centerX: number;
    centerY: number;
    type?: string;
    bounds?: { left: number; top: number; right: number; bottom: number };
    [key: string]: unknown;
  }>;

  /**
   * 千机流程退出原因（testOnlyQianjiFlow 消费）
   * - 'no_pending': 当前无报备（步骤 2 退出）
   * - 'no_baoli': 界面无保利（步骤 3 退出）
   * - null: 正常完成
   */
  lastExitReason: 'no_pending' | 'no_baoli' | null;

  /**
   * 保利 service 实例（步骤 4 同步调用，保留老行为）
   * 不引入事件总线（W3 纯机械替换阶段）
   * TODO W6 类型收紧为 BaoliService（现在用 any 规避 QianjiService ↔ BaoliService 循环引用）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baoliService: any;
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