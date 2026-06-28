/**
 * 设备机型分支 + 兜底坐标映射（v2 演进版 - 2026-06-27）
 *
 * 老板拍板 D 方案：按机型选择兜底坐标，适配更多真机。
 *
 * 设计原则：
 * - 系统弹窗节点（如 EMUI 粘贴弹窗 / OriginOS 粘贴弹窗）无法被 AccessibilityService 识别
 *   → 必须用固定坐标兜底
 * - 不同手机不同弹窗系统的"粘贴"按钮位置不同
 *   → 必须按机型分支
 * - dpCoord() 待补：当前 deviceModel 不提供 dp→px 工具，consumers（如 actions/input.ts）
 *   自行实现屏宽归一化（360dp 基准）
 * - 不同弹窗系统的"粘贴"按钮 dp 位置不同（OriginOS 弹窗 ≠ EMUI 弹窗）
 *
 * v2 演进路径：utils/deviceModel.ts → adapters/devices.ts（曾计划 W6 起迁移，
 *              把 Action 适配层彻底分离；v2 已完成但未执行，当前继续用 deviceModel.ts）
 *
 * v1.6.4 实战版本来自 release 分支 f2e30f2，refactor/v2 独立复制一份演进。
 *
 * 新增机型流程：
 * 1. 在新真机长按输入框触发弹窗 → 截图 → 量"粘贴"中心相对屏幕的像素位置 (x, y)
 * 2. 算出 dp 坐标：dp = px × 360 / screen_width_px
 * 3. 在 DEVICE_PASTE_MENU_COORDS 加一条：'xxx': { x: a, y: b }
 *
 * @example
 * // 老板 2026-06-26/28 实测（**老板只给 px 值，铁子按屏宽归一化换算 dp**）
 * // vivo V2166A: 弹窗"粘贴"在 (100, 460) px @ 720×1600 屏宽 → (50, 230) dp
 * // nova 7 5G:   弹窗"粘贴"在 (140, 720) px @ 1080×2400 屏宽 → (47, 240) dp
 */
import { Platform } from 'react-native';
import { zbbAutomation } from '@/native';

/** 弹窗"粘贴"按钮的 dp 坐标 */
export interface PasteMenuCoord {
  x: number;  // dp
  y: number;  // dp
}

/**
 * 机型特征 → 弹窗"粘贴" dp 坐标 映射表
 * 匹配规则：includes（不区分大小写，先匹配 model 再匹配 brand）
 */
const DEVICE_PASTE_MENU_COORDS: Record<string, PasteMenuCoord> = {
  // vivo V2166A（Y33s 中国版，OriginOS Ocean，720×1600 px / 360 dp / ratio=2）
  // 老板 2026-06-26 实测"粘贴"在 (100, 460) px → (50, 230) dp
  'V2166A': { x: 50, y: 230 },
  // vivo 品牌兜底（包含 V21 / Y33s / vivo 等机型）
  'vivo': { x: 50, y: 230 },

  // nova 7 5G（EMUI 12，1080×2400 xxhdpi / 360 dp / ratio=3）
  // 老板 2026-06-21 实测"粘贴"在 (140, 720) px → (47, 240) dp
  'nova 7 5G': { x: 47, y: 240 },
  // 华为品牌兜底（包含 nova / P30 / Mate 等机型）
  'HUAWEI': { x: 47, y: 240 },
};

/** 默认 fallback（保持向后兼容） */
const DEFAULT_FALLBACK: PasteMenuCoord = { x: 47, y: 240 };

/**
 * 读取当前设备的多维度标识
 * 注：ro.product.model 在 vivo 上返回 'V2166A' 或 'vivo Y33s'（因厂商/版本而异）
 *     ro.product.brand 在 vivo 上返回 'vivo'，在华为上返回 'HUAWEI'
 */
async function getDeviceIdentity(): Promise<string> {
  if (Platform.OS !== 'android') {
    return '';
  }
  try {
    const [model, brand, device, manufacturer] = await Promise.all([
      zbbAutomation.execShell('getprop ro.product.model').catch(() => ''),
      zbbAutomation.execShell('getprop ro.product.brand').catch(() => ''),
      zbbAutomation.execShell('getprop ro.product.device').catch(() => ''),
      zbbAutomation.execShell('getprop ro.product.manufacturer').catch(() => ''),
    ]);
    const identity = [model, brand, device, manufacturer]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join('|');
    console.log('[deviceModel] 设备标识:', identity);
    return identity;
  } catch (e) {
    console.warn('[deviceModel] getDeviceIdentity 失败:', e);
    return '';
  }
}

/**
 * 按机型匹配弹窗"粘贴"按钮 dp 坐标
 *
 * @returns dp 坐标（consumers 需自行转 px；当前 actions/input.ts 内联 dpToPx 处理屏宽归一化）
 */
export async function getPasteMenuCoord(): Promise<PasteMenuCoord> {
  const identity = await getDeviceIdentity();
  if (!identity) {
    console.warn('[deviceModel] 设备标识为空，使用 fallback (47, 240) dp');
    return DEFAULT_FALLBACK;
  }
  for (const key of Object.keys(DEVICE_PASTE_MENU_COORDS)) {
    if (identity.toLowerCase().includes(key.toLowerCase())) {
      const coord = DEVICE_PASTE_MENU_COORDS[key];
      console.log('[deviceModel] 命中机型规则 "' + key + '" → (' + coord.x + ', ' + coord.y + ') dp');
      return coord;
    }
  }
  console.warn('[deviceModel] 未匹配任何机型规则，使用 fallback (47, 240) dp');
  return DEFAULT_FALLBACK;
}