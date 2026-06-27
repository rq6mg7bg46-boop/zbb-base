// client/actions/find.ts
// 节点查找类 Action（v2 设计文档 §5.2）
// 所有 find 走 getAllTextNodes 自己 includes/=== 匹配，不调 native findAccessibilityNodeInfosByText
// 原因：中文 UI 上 findAccessibilityNodeInfosByText 不可靠（老板 06-26 验证）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';
import { delay, gammaDelay } from './delay';

/** 文字节点类型（与 native 层返回结构对齐） */
export interface TextNode {
  text: string;
  centerX: number;
  centerY: number;
  type?: string;
}

/** find retry 默认参数 */
const DEFAULT_RETRIES = 3;
const DEFAULT_MIN_DELAY = 800;
const DEFAULT_MAX_DELAY = 1500;

/**
 * findText(text, opts?) - 按文本 includes 查找单个节点 + retry
 * 复用于 BaoliService.findNodeByText + QianjiService 多处 includes 匹配
 */
export async function findText(
  text: string,
  opts?: { retries?: number; minDelay?: number; maxDelay?: number }
): Promise<ActionResult<TextNode>> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const minDelay = opts?.minDelay ?? DEFAULT_MIN_DELAY;
  const maxDelay = opts?.maxDelay ?? DEFAULT_MAX_DELAY;
  for (let i = 0; i < retries; i++) {
    const nodes = await zbbAutomation.getAllTextNodes();
    const found = nodes?.find((n: TextNode) => n.text && n.text.includes(text));
    if (found) return { ok: true, data: found };
    if (i < retries - 1) await delay(gammaDelay(minDelay, maxDelay));
  }
  return { ok: false, error: new ActionError('findText', null, `"${text}" 未找到（重试 ${retries} 次）`) };
}

/**
 * findAllText(text) - 按文本 includes 查找所有节点（无 retry）
 * 复用于 BaoliService 步骤 13 projectName 子串匹配
 */
export async function findAllText(text: string): Promise<ActionResult<TextNode[]>> {
  const nodes = await zbbAutomation.getAllTextNodes();
  const matched = nodes?.filter((n: TextNode) => n.text && n.text.includes(text)) ?? [];
  return { ok: true, data: matched };
}

/**
 * findExactNode(text, opts?) - 按文本严格 === 匹配 + retry
 * 复用于 BaoliService 步骤 7/14/16（text === '复制' / '确认' / '报备'）
 */
export async function findExactNode(
  text: string,
  opts?: { retries?: number; minDelay?: number; maxDelay?: number }
): Promise<ActionResult<TextNode>> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const minDelay = opts?.minDelay ?? DEFAULT_MIN_DELAY;
  const maxDelay = opts?.maxDelay ?? DEFAULT_MAX_DELAY;
  for (let i = 0; i < retries; i++) {
    const nodes = await zbbAutomation.getAllTextNodes();
    const found = nodes?.find((n: TextNode) => n.text === text);
    if (found) return { ok: true, data: found };
    if (i < retries - 1) await delay(gammaDelay(minDelay, maxDelay));
  }
  return { ok: false, error: new ActionError('findExactNode', null, `"${text}" 未找到（重试 ${retries} 次）`) };
}

/**
 * findNodeCenter(text, opts?) - 按文本查找节点中心坐标
 * 不调 native zbbAutomation.findNodeCenterByText（中文 UI 不可靠，老板 06-26 验证）
 */
export async function findNodeCenter(
  text: string,
  opts?: { retries?: number }
): Promise<ActionResult<{ x: number; y: number }>> {
  const result = await findText(text, opts);
  if (!result.ok || !result.data) return { ok: false, error: result.error };
  return { ok: true, data: { x: result.data.centerX, y: result.data.centerY } };
}

/**
 * getAllTextNodes() - 获取当前界面所有文字节点
 * 复用于千机 step2（存 lastTextNodes）+ 保利 step9（存 formNodes）
 */
export async function getAllTextNodes(): Promise<ActionResult<TextNode[]>> {
  try {
    const nodes = await zbbAutomation.getAllTextNodes();
    return { ok: true, data: nodes ?? [] };
  } catch (e) {
    return { ok: false, error: new ActionError('getAllTextNodes', e) };
  }
}