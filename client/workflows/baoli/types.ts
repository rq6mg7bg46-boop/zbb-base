// client/workflows/baoli/types.ts
// 保利 workflow 共享类型（v2 设计文档 §3 保利端 + W4 迁移）

import type { WorkflowContext } from '@/engine';

/**
 * 保利端界面识别结果
 * 来源：v1.6.4 execute() P1-P7 各步骤的 node find
 */
export type BaoliInterfaceState =
  | 'desktop'           // P1 已退出到桌面
  | 'wechat_workspace'  // P3 企微工作台
  | 'cloud_home'        // P4 进入云和家经纪云
  | 'project_list'      // P5 项目列表（找山水和颂）
  | 'report_form'       // P7 报备按钮已点
  | 'unknown';

/**
 * 保利端 workflow 上下文
 * 继承通用 WorkflowContext + 保利专属字段
 */
export interface BaoliContext extends WorkflowContext {
  /**
   * 保利 service 实例（P2-P7 调 this.findNodeByText / findExactNode / printScreenText / findNodeCenterByText）
   * TODO W6 类型收紧为 BaoliService（现在用 any 规避循环引用）
   * 注：W4 阶段保留老设计（step 持 service 实例），W5+ 拆 findNodeByText 到 actions 工具库
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baoliService: any;

  /**
   * 保利流程退出原因
   * - 'no_workbench': 工作台未找到（P3 退出）
   * - 'no_cloud_home': 云和家未找到（P4 退出）
   * - 'no_project': 项目未找到（P5 退出）
   * - null: 正常完成
   */
  lastExitReason: 'no_workbench' | 'no_cloud_home' | 'no_project' | null;

  /**
   * 当前报备轮次（1=缦城和颂，2=山水和颂）
   * v1.6.4 流程内自动判断（fillForm 内 round=1 → handleSecondRound → round=2）
   * W4 阶段保留老设计，W5+ 用 ctx.round
   */
  round: number;

  // ========== W5 填表段扩展字段（P8-P15 跨步共享）==========

  /**
   * 当前轮填表的项目名（默认缦城和颂，第 2 轮由 BaoliService.handleSecondRound 改为山水和颂）
   * 注入点：buildBaoliContext(round, projectName)
   */
  projectName: string;

  /**
   * P8 抓的"粘贴完整客户信息..."节点（找不到时为 null，进入兜底坐标长按分支）
   * P9 解析用
   */
  pasteNode: { centerX: number; centerY: number; text: string } | null;

  /**
   * P9 抓的界面节点列表（getAllTextNodes 结果）
   * P9 解析 + P10 入口检测共用
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formNodes: any[];

  /**
   * P9 解析后的客户信息（9 字段 + 兜底性别）
   * P10-P15 共享（虽然实际不再使用，但保留供 log/debug）
   */
  companyName: string;
  customerName: string;
  customerGender: string;
  customerPhone: string;
  reportProject: string;
  propertyType: string;
  reportTime: string;
  expectedVisitTime: string;
  agentName: string;

/**
 * P10 入口检测结果（isFormFilledSilent 调用结果）
   * true = 已填充 / false = 未填充（仅 warn，不影响流程）
   */
  formFilled: boolean;

  // ========== W9 detectResult V2 化扩展（P16 报备结果检测）==========

  /**
   * W9 detectResult V2 化：检测状态（V2 workflow 内传递）
   * - 'pending': 待检测（detectRepeatStep 入口）
   * - 'repeat': 疑似重号（detectRepeatStep 命中 → detectSuccessStep 跳过 → 走 handleRepeatCase）
   * - 'success': 报备成功（detectSuccessStep 命中 → 走 handleSuccessCase）
   * - 'timeout': 30s 内未检测到结果（detectTimeoutStep 跑完）
   */
  detectState: 'pending' | 'repeat' | 'success' | 'timeout';

  /**
   * P16 检测超时重试次数（0-6，W9 detectResult V2 化）
   */
  detectRetryCount: number;

  /**
   * P16 检测起始时间戳（detectTimeoutStep 用）
   */
  detectStartTime: number;

  /**
   * P16 检测当前轮次（1=缦城，2=山水），与 ctx.round 同步但语义更明确
   */
  detectRound: 1 | 2;
}
