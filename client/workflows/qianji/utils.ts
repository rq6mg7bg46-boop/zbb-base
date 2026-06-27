// client/workflows/qianji/utils.ts
// 千机工作流工具函数（来源：QianjiService.ts L36-110，2026-06-27 抽出）
// W3 阶段纯机械复制，不重写

import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';

// ========== 延时配置（2026-06-20 老板拍板：原 3-5s 偏长，下调到 2-3s）==========
export const QIANJI_DELAY_CONFIG = {
  openApp: { min: 2000, max: 3000 },
  other: { min: 2000, max: 3000 },
} as const;

/** getDelay(type) - 区间随机延时（毫秒） */
export function getDelay(type: 'openApp' | 'other'): number {
  switch (type) {
    case 'openApp':
      return Math.floor(
        Math.random() * (QIANJI_DELAY_CONFIG.openApp.max - QIANJI_DELAY_CONFIG.openApp.min + 1)
      ) + QIANJI_DELAY_CONFIG.openApp.min;
    default:
      return Math.floor(
        Math.random() * (QIANJI_DELAY_CONFIG.other.max - QIANJI_DELAY_CONFIG.other.min + 1)
      ) + QIANJI_DELAY_CONFIG.other.min;
  }
}

// ========== P+ 拟人化工具函数（与 BaoliService 同样逻辑）==========

/** 1. 不规则点击坐标（均匀分布 ±5px） */
export async function humanTap(x: number, y: number): Promise<void> {
  const dx = Math.round(Math.random() * 10 - 5);
  const dy = Math.round(Math.random() * 10 - 5);
  logToBoth('info', `[P+ humanTap] (${x},${y}) + (${dx},${dy})`);
  void zbbAutomation.tap(x + dx, y + dy);
}

/** 3. 随机停顿（Poisson 分布，默认 8% 概率）—— 用 @/actions.maybePause 替代 */
/** 已废弃：改用 @/actions/maybePause（一致行为 Poisson 分布 8%） */

/** 4. 页面停留时长（Gamma 分布替代均匀分布） */
export function pGammaDelay(min: number, max: number): number {
  const mean = (min + max) / 2;
  const variance = (max - min) / 4;
  const u1 = Math.max(0.0001, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const gamma = Math.round(mean + z * variance);
  return Math.max(min, Math.min(max, gamma));
}

/** 5. 滚动 bounce（overshoot + 回弹，模拟手指惯性） */
export async function humanSwipeWithBounce(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  duration: number
): Promise<void> {
  await zbbAutomation.swipe(x1, y1, x2 + 20, y2 - 30, duration);
  await zbbAutomation.delay(200);
  await zbbAutomation.swipe(x2 + 20, y2 - 30, x2, y2, 300);
}

// ========== 千机客户信息解析（来源：QianjiService.ts parseClipboardText L432-525）==========

/** 解析后的客户信息（与 QianjiService customerInfo 字段一致） */
export interface ParsedCustomerInfo {
  projectType: 'baoli' | 'yuexiu' | string;
  customerName: string;
  phone: string;
  agent: string;
  agentPhone: string;
  reportTime: string;
  expectedVisitTime: string;
  city: string;
  phoneLast4?: string;
}

/**
 * parseClipboardText(text) - 解析"key：value"格式文本提取客户信息
 * 来源：QianjiService.ts parseClipboardText L432-525
 * 兼容两套 key：旧（客户联系方式/经纪人姓名/报备提交时间）+ 新（联系方式/经纪人/报备提交/售卖城市）
 */
export function parseClipboardText(text: string): ParsedCustomerInfo | null {
  try {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const result: ParsedCustomerInfo = {
      projectType: 'baoli',
      customerName: '',
      phone: '',
      agent: '',
      agentPhone: '',
      reportTime: '',
      expectedVisitTime: '',
      city: '',
    };

    for (const line of lines) {
      if (line.includes('客户姓名：') || line.includes('客户姓名:')) {
        result.customerName = line.split(/[：:]/)[1]?.trim() || '';
      } else if (line.includes('客户联系方式：') || line.includes('客户联系方式:')) {
        result.phone = line.split(/[：:]/)[1]?.trim().replace(/\*/g, '') || '';
      } else if (!line.includes('客户姓名') && (line.includes('联系方式：') || line.includes('联系方式:'))) {
        // 2026-06-20 千机"报备审核"页节点格式：key 名为"联系方式"
        result.phone = line.split(/[：:]/)[1]?.trim().replace(/\*/g, '') || '';
      } else if (line.includes('报备项目：') || line.includes('报备项目:')) {
        const project = line.split(/[：:]/)[1]?.trim() || '';
        result.projectType = project.includes('越秀') ? 'yuexiu' : 'baoli';
      } else if (line.includes('经纪人姓名：') || line.includes('经纪人姓名:')) {
        result.agent = line.split(/[：:]/)[1]?.trim() || '';
      } else if (!line.includes('经纪人姓名') && (line.includes('经纪人：') || line.includes('经纪人:'))) {
        // 老板拍板：经纪人含电话要分离
        const rawAgent = line.split(/[：:]/)[1]?.trim() || '';
        const agentMatch = rawAgent.match(/^(.+?)\s+(\d{11})$/);
        if (agentMatch) {
          result.agent = agentMatch[1].trim();
          result.agentPhone = agentMatch[2];
        } else {
          result.agent = rawAgent;
          result.agentPhone = '';
        }
      } else if (line.includes('报备提交时间：') || line.includes('报备提交时间:')) {
        result.reportTime = line.split(/[：:]/)[1]?.trim() || '';
      } else if (!line.includes('报备提交时间') && (line.includes('报备提交：') || line.includes('报备提交:'))) {
        result.reportTime = line.split(/[：:]/)[1]?.trim() || '';
      } else if (line.includes('预计到访时间：') || line.includes('预计到访时间:')) {
        result.expectedVisitTime = line.split(/[：:]/)[1]?.trim() || '';
      } else if (line.includes('售卖城市：') || line.includes('售卖城市:')) {
        result.city = line.split(/[：:]/)[1]?.trim() || '';
      }
      // 回退：行内含关键词
      else if (line.includes('保利')) {
        result.projectType = 'baoli';
      } else if (line.includes('越秀')) {
        result.projectType = 'yuexiu';
      } else if (line.includes('女士') || line.includes('先生') || line.includes('小姐') || line.includes('太太')) {
        result.customerName = line;
      } else if (/^1[3-9]\d{9}$/.test(line.replace(/\s/g, '').replace(/\*/g, ''))) {
        result.phone = line.replace(/\s/g, '').replace(/\*/g, '');
      } else if (line.includes('经纪人') && !line.includes('姓名')) {
        result.agent = line;
      } else if (line.includes('报备') && line.includes('20')) {
        result.reportTime = line;
      }
    }

    if (!result.customerName && !result.phone) {
      logToBoth('warn', '[千机：步骤3-4] 解析结果不完整，原始内容: ' + text);
      return null;
    }

    return result;
  } catch (error) {
    logToBoth('error', `[千机：步骤3-4] 解析剪贴板失败: ${error}`);
    return null;
  }
}

/**
 * assembleKeyValueLines(nodes) - 把 "key:" 换行 "value" 拼成 "key:value" 单行
 * 来源：QianjiService.ts assembleKeyValueLines L532-554
 * 例：['客户姓名:', '代先生', ...] → ['客户姓名:代先生', ...]
 */
export function assembleKeyValueLines(nodes: { text: string }[]): string {
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const text = (nodes[i].text || '').trim();
    if (!text) continue;
    if (/[：:]\s*$/.test(text) && i + 1 < nodes.length) {
      const nextText = (nodes[i + 1].text || '').trim();
      if (nextText && !/^[：:]\s*$/.test(nextText)) {
        lines.push(`${text}${nextText}`);
        i++;
        continue;
      }
    }
    lines.push(text);
  }
  return lines.join('\n');
}