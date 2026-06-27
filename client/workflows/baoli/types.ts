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
}
