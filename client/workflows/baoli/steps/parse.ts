// client/workflows/baoli/steps/parse.ts
// 保利 P9 续：解析剪贴板内容（9 字段 + 兜底性别）
// 来源：BaoliService.ts fillForm() L510-594

import type { StepFn } from '@/engine';
import { logToBoth } from '@/services/AutomationLogger';
import type { BaoliContext } from '../types';

/**
 * P9 续：解析 formNodes 中的 KV 行
 * 字段：companyName / customerName / customerGender / customerPhone / reportProject /
 *       propertyType / reportTime / expectedVisitTime / agentName
 * 性别兜底：从姓名末尾推断（"女士|小姐|太太"=女，"先生"=男）
 */
export const parseFormNodesStep: StepFn<BaoliContext, void> = async (ctx) => {
  ctx.formNodes?.forEach((node: any) => {
    const text = node.text || '';
    if (!text || text.trim().length === 0) return;
    logToBoth('info', `[P9] 节点: "${text}" @ (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`);

    // 拆行处理（剪贴板预览是大块 text 包含 \n，单行匹配更稳）
    const lines = text.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // 公司名称
      if (!ctx.companyName) {
        const m = line.match(/^公司名称[：:](.+)$/);
        if (m) ctx.companyName = m[1].trim();
      }
      // 客户姓名
      if (!ctx.customerName) {
        const m = line.match(/^客户姓名[：:](.+)$/);
        if (m) ctx.customerName = m[1].trim();
      }
      // 客户联系方式（兼容"客户联系方式"和"联系方式"）
      if (!ctx.customerPhone) {
        const m = line.match(/^(?:客户)?联系方式[：:](.+)$/);
        if (m) ctx.customerPhone = m[1].trim();
      }
      // 性别（直接匹配"性别"标签，优先于姓名推断）
      if (!ctx.customerGender) {
        const m = line.match(/^性别[：:](.+)$/);
        if (m) {
          const g = m[1].trim();
          if (g === '男' || g === '女') ctx.customerGender = g;
        }
      }
      // 报备项目
      if (!ctx.reportProject) {
        const m = line.match(/^报备项目[：:](.+)$/);
        if (m) ctx.reportProject = m[1].trim();
      }
      // 物业类型
      if (!ctx.propertyType) {
        const m = line.match(/^物业类型[：:](.+)$/);
        if (m) ctx.propertyType = m[1].trim();
      }
      // 报备提交时间（兼容"报备提交时间"和"报备提交"）
      if (!ctx.reportTime) {
        const m = line.match(/^报备提交(?:时间)?[：:](.+)$/);
        if (m) ctx.reportTime = m[1].trim();
      }
      // 预计到访时间
      if (!ctx.expectedVisitTime) {
        const m = line.match(/^预计到访时间[：:](.+)$/);
        if (m) ctx.expectedVisitTime = m[1].trim();
      }
      // 经纪人姓名（兼容"经纪人姓名"和"经纪人"）
      if (!ctx.agentName) {
        const m = line.match(/^经纪人(?:姓名)?[：:](.+)$/);
        if (m) ctx.agentName = m[1].trim();
      }
    }

    // 兜底：如果 reportProject 仍空，第一行可能是项目名（无 "XX:" 格式）
    if (!ctx.reportProject && lines.length > 0) {
      const firstLine = lines[0];
      if (!firstLine.includes(':') && !firstLine.includes('：')) {
        ctx.reportProject = firstLine;
      }
    }
  });

  // 判断性别（兜底：仅在"性别"标签未匹配时，从姓名末尾推断）
  if (!ctx.customerGender && ctx.customerName) {
    if (/[女士|小姐|太太]$/.test(ctx.customerName)) ctx.customerGender = '女';
    else if (/先生$/.test(ctx.customerName)) ctx.customerGender = '男';
  }

  logToBoth('info', `[P9] 解析结果: 公司=${ctx.companyName} 客户=${ctx.customerName} 性别=${ctx.customerGender} 电话=${ctx.customerPhone} 项目=${ctx.reportProject} 物业=${ctx.propertyType} 报备时间=${ctx.reportTime} 到访时间=${ctx.expectedVisitTime} 经纪人=${ctx.agentName}`);

  return { ok: true };
};
