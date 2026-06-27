// client/actions/delay.ts
// 等待类 Action（v2 设计文档 §5.2）

import { ActionResult } from './types';

/**
 * delay(ms, dist?) - 等待指定毫秒
 * - dist='fixed' 固定 ms（默认）
 * - dist='gamma' 拟人化伽马分布（ms 作为 max，min=ms/2）
 */
export async function delay(
  ms: number,
  dist: 'fixed' | 'gamma' = 'fixed'
): Promise<ActionResult> {
  const actualMs = dist === 'gamma' ? gammaDelay(ms / 2, ms) : ms;
  await new Promise((r) => setTimeout(r, actualMs));
  return { ok: true };
}

/**
 * gammaDelay(min, max) - 拟人化伽马分布延迟
 * 复用于千机 step1 / 保利多步（老板 06-14 加，06-27 抽到 actions/）
 */
export function gammaDelay(min: number, max: number): number {
  const mean = (min + max) / 2;
  const variance = (max - min) / 4;
  const u1 = Math.max(0.0001, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(min, Math.min(max, Math.round(mean + z * variance)));
}

/** 均匀分布随机延迟（备用，业务少用） */
export function randomDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}