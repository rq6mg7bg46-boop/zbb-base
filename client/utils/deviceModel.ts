/**
 * 设备机型分支 + 兜底坐标映射（v3 演进版 - 2026-06-29）
 *
 * 老板拍板 2026-06-29：全量改 dp 化 + 机型分支
 * - 现有 34 个 stepName 入表（按 nova 7 5G 1080 屏实测 px，÷3 = dp）
 * - vivo V2166A 兜底 = nova 7 5G dp × 0.667 几何缩放（标 TODO，等 vivo 实测覆盖）
 *
 * 设计原则：
 * - 系统弹窗节点无法被 AccessibilityService 识别 → 必须用固定坐标兜底
 * - 不同手机 UI 元素位置不同 → 必须按机型分支
 * - dpCoord() 提供：屏宽归一化（360dp 基准）+ 机型选择
 *
 * v2 → v3 演进路径：
 *   v2 仅 2 个 stepName（pasteMenu/clearRecentTasks）
 *   v3 全项目 34 个 stepName 覆盖
 *
 * 已有 v2 API（向后兼容，不破坏老调用）：
 * - getPasteMenuCoord() / getClearRecentTasksCoord()
 *
 * v3 新 API：
 * - getTapCoord(stepName) / getSwipeCoord(stepName) / getLongPressCoord(stepName)
 *   返回 px 坐标（按机型分支 + 屏宽归一化）
 * - dpToPx(dpCoord) / swipeDpToPx(swipeDpCoord)
 *
 * 新增机型流程：
 * 1. 在新真机走一遍流程 → 截图 → 量每步 px 位置
 * 2. 算 dp：dp = px × 360 / screen_width_px
 * 3. 在 DEVICE_TAP_COORDS / DEVICE_SWIPE_COORDS 加一条机型分支
 * 4. 几何缩放兜底（× 0.667）保留为 TODO，等 vivo 实测后覆盖
 *
 * @example
 * // 老板 2026-06-28 实测：vivo V2166A Recents 清除按钮 (530, 1460) px → (265, 730) dp
 * // 老板 2026-06-21 实测：nova 7 5G EMUI 粘贴弹窗 (140, 720) px → (47, 240) dp
 */
import { Platform } from 'react-native';
import { zbbAutomation } from '@/native';

// ============================================================================
// 类型定义
// ============================================================================

/** dp 坐标（360dp 基准的逻辑坐标） */
export interface DpCoord {
  x: number;
  y: number;
}

/** swipe 类 dp 坐标（含起止 + duration） */
export interface SwipeDpCoord {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration?: number;
}

/** px 坐标（设备实际像素） */
export interface PxCoord {
  x: number;
  y: number;
}

/** swipe 类 px 坐标 */
export interface SwipePxCoord {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration?: number;
}

/** 机型分支条目（按 nova 7 5G / vivo 分） */
export interface DeviceTapEntry {
  nova7_5g: DpCoord;   // 华为 nova 7 5G（1080 屏 / ratio=3）实测 dp
  vivo: DpCoord;       // vivo V2166A（720 屏 / ratio=2）兜底 dp
}

/** swipe 机型分支条目 */
export interface DeviceSwipeEntry {
  nova7_5g: SwipeDpCoord;
  vivo: SwipeDpCoord;
}

// ============================================================================
// v2 已有的 2 个 stepName（保留 API）
// ============================================================================

/** 弹窗"粘贴"按钮 dp 坐标（v2 兼容） */
export interface PasteMenuCoord {
  x: number;
  y: number;
}

const DEVICE_PASTE_MENU_COORDS: Record<string, PasteMenuCoord> = {
  'V2166A': { x: 50, y: 230 },   // vivo V2166A（720 屏）实测 (100, 460) px
  'vivo': { x: 50, y: 230 },     // vivo 品牌兜底
  'nova 7 5G': { x: 47, y: 240 }, // 华为 nova 7 5G（1080 屏）实测 (140, 720) px
  'HUAWEI': { x: 47, y: 240 },   // 华为品牌兜底
};
const DEFAULT_FALLBACK: PasteMenuCoord = { x: 47, y: 240 };

/** Recents 清除按钮 dp 坐标（v2 兼容） */
export interface ClearRecentTasksCoord {
  x: number;
  y: number;
}

const DEVICE_CLEAR_RECENT_TASKS_COORDS: Record<string, ClearRecentTasksCoord> = {
  'V2166A': { x: 265, y: 730 },  // vivo V2166A（720 屏）实测 (530, 1460) px
  'vivo': { x: 265, y: 730 },    // vivo 品牌兜底
};
const CLEAR_DEFAULT_FALLBACK: ClearRecentTasksCoord = { x: 265, y: 730 };

// ============================================================================
// v3 全项目 tap 类坐标表（34 个 stepName）
// ============================================================================
//
// 数据来源：
// - nova 7 5G 1080 屏：老板历史实测 px（v2.0.x 期间 39 处硬编码）
// - vivo V2166A 720 屏：几何缩放兜底（× 0.667），TODO 等 vivo 实测覆盖
//
// nova 7 5G ratio = 1080 / 360 = 3，px → dp = px ÷ 3
// vivo V2166A ratio = 720 / 360 = 2，dp → px = dp × 2
//
// 🔴 标记的 dp 在 nova 7 5G 上也接近屏边（y > 800 或 x > 540），vivo 上对应几何缩放后更安全

export const DEVICE_TAP_COORDS: Record<string, DeviceTapEntry> = {
  // ---- workflows/baoli/steps/ (9处，1处 longPress 单列) ----
  workbench: {                  // P3 工作台 tab
    nova7_5g: { x: 180, y: 66 },     // (540, 199) ÷3
    vivo: { x: 120, y: 44 },          // TODO vivo 实测覆盖
  },
  cloudHome: {                  // P4 云和家经纪云
    nova7_5g: { x: 223, y: 501 },    // (668, 1502) ÷3
    vivo: { x: 149, y: 334 },
  },
  clickReport: {                // P7 报备按钮（工作台点报备）
    nova7_5g: { x: 233, y: 733 },    // (700, 2200) ÷3
    vivo: { x: 240, y: 725 },         // 老板 06-29 vivo 实测 (479,1450) px ÷2
  },
  clickReportForm: {            // P14 表单内"报备"按钮
    nova7_5g: { x: 180, y: 733 },    // (540, 2200) ÷3
    vivo: { x: 150, y: 725 },         // 老板 06-29 vivo 实测 (299,1450) px ÷2
  },
  checkEntry_fenqi: {           // P10 请选择分期
    nova7_5g: { x: 193, y: 213 },    // (580, 640) ÷3
    vivo: { x: 174, y: 200 },         // 老板 06-29 vivo 实测 (347,399) px ÷2
  },
  selectProject_round1: {       // P11 选择项目 - 第 1 轮缦城和颂
    nova7_5g: { x: 180, y: 667 },    // (540, 2000) ÷3
    vivo: { x: 120, y: 444 },
  },
  selectProject_round2: {       // P11 选择项目 - 第 2 轮山水和颂（同坐标，ctx.round 区分）
    nova7_5g: { x: 180, y: 667 },
    vivo: { x: 180, y: 718 },         // 老板 06-29 vivo OCR 命中 (360,1436) px ÷2
  },
  confirm: {                    // P12 确认
    nova7_5g: { x: 317, y: 500 },    // (950, 1500) ÷3
    vivo: { x: 320, y: 497 },         // 老板 06-29 vivo OCR 命中 (639,993) px ÷2
  },
  aiRecognize: {                // P13 智能识别
    nova7_5g: { x: 303, y: 367 },    // (910, 1100) ÷3
    vivo: { x: 307, y: 446 },         // 老板 06-29 vivo OCR 命中 (613,892) px ÷2
  },

  // ---- services/BaoliService.ts (4处) ----
  baoli_humanTap_baobeiBtn: {   // 报备按钮兜底（workbench 列表）
    nova7_5g: { x: 233, y: 733 },    // (700, 2200) ÷3
    vivo: { x: 155, y: 489 },
  },
  baoli_multiTask_key: {        // 系统多任务键（P+ 保留：系统键不能偏移）
    nova7_5g: { x: 100, y: 767 },    // (300, 2300) ÷3
    vivo: { x: 67, y: 511 },
  },
  baoli_trash_key: {            // 系统垃圾箱键（P+ 保留：系统键不能偏移）
    nova7_5g: { x: 180, y: 717 },    // (540, 2150) ÷3
    vivo: { x: 120, y: 478 },
  },

  // ---- services/NativeAutomationService.ts (23处) ----
  native_click_540_1100: {
    nova7_5g: { x: 180, y: 367 },
    vivo: { x: 120, y: 244 },
  },
  native_blankArea_540_300: {   // 点击空白区域收起键盘/弹窗（×3 共用）
    nova7_5g: { x: 180, y: 100 },
    vivo: { x: 120, y: 67 },
  },
  native_click_170_2066: {
    nova7_5g: { x: 57, y: 689 },
    vivo: { x: 38, y: 459 },
  },
  native_click_540_1463: {
    nova7_5g: { x: 180, y: 488 },
    vivo: { x: 120, y: 325 },
  },
  native_click_540_1200: {
    nova7_5g: { x: 180, y: 400 },
    vivo: { x: 120, y: 267 },
  },
  native_click_540_1450: {
    nova7_5g: { x: 180, y: 483 },
    vivo: { x: 120, y: 322 },
  },
  native_project_山水和颂: {     // 步骤5 项目名"郑州保利山水和颂"
    nova7_5g: { x: 187, y: 450 },    // (560, 1350) ÷3
    vivo: { x: 124, y: 300 },
  },
  native_tap_baobeiBtn_700_2200: {  // 步骤8 报备兜底
    nova7_5g: { x: 233, y: 733 },
    vivo: { x: 155, y: 489 },
  },
  native_tap_paste_130_710: {       // 步骤12 粘贴（×2 共用）
    nova7_5g: { x: 43, y: 237 },
    vivo: { x: 29, y: 158 },
  },
  native_tap_540_1300: {            // 步骤16/第二轮步骤13 项目名（×2 共用）
    nova7_5g: { x: 180, y: 433 },
    vivo: { x: 120, y: 289 },
  },
  native_tap_confirm_540_2150: {    // 确认按钮兜底（×3 共用）
    nova7_5g: { x: 180, y: 717 },
    vivo: { x: 120, y: 478 },
  },
  native_tap_970_1240: {            // 🔴 nova 7 5G 也接近屏边（970/1080）
    nova7_5g: { x: 323, y: 413 },    // (970, 1240) ÷3
    vivo: { x: 216, y: 275 },
  },
  native_tap_山水和颂_540_2159: {   // 第二轮步骤9 分期选山水和颂兜底
    nova7_5g: { x: 180, y: 720 },    // (540, 2159) ÷3
    vivo: { x: 120, y: 480 },
  },
  native_click_300_2300: {          // 多任务键（同 baoli_multiTask_key）
    nova7_5g: { x: 100, y: 767 },
    vivo: { x: 67, y: 511 },
  },
  native_click_540_2300: {          // 🔴 接近屏底
    nova7_5g: { x: 180, y: 767 },    // (540, 2300) ÷3
    vivo: { x: 120, y: 511 },
  },
  // ---- services/WechatAutomation.ts:167 校准坐标（v3 漏扫补遗）----
  native_wechat_tuijian_calib: {
    nova7_5g: { x: 60, y: 169 },     // (180, 506) ÷3
    vivo: { x: 40, y: 113 },         // × 0.667 几何缩放
  },

  // ---- v3 补遗（老板质疑"再核实是否全部替换"后扫描发现）----
  native_douyin_msgBtn_750_2300: {        // 抖音：步骤2 消息兜底
    nova7_5g: { x: 250, y: 767 },         // (750, 2300) ÷3
    vivo: { x: 167, y: 511 },             // × 0.667 几何缩放
  },
  native_douyin_friendBtn_360_360: {      // 抖音：步骤3 好友兜底
    nova7_5g: { x: 120, y: 120 },         // (360, 360) ÷3
    vivo: { x: 80, y: 80 },               // × 0.667 几何缩放
  },
  native_wechat_nameInput_350_1130: {     // 企业微信：步骤10 姓名输入框
    nova7_5g: { x: 117, y: 377 },         // (350, 1130) ÷3
    vivo: { x: 78, y: 251 },              // × 0.667 几何缩放
  },
  native_wechat_phoneInput_350_1262: {    // 企业微信：步骤11 电话输入框
    nova7_5g: { x: 117, y: 421 },         // (350, 1262) ÷3
    vivo: { x: 78, y: 280 },              // × 0.667 几何缩放
  },
  native_wechat_genderFemale_933_1265: {  // 企业微信：步骤11.5 性别-女
    nova7_5g: { x: 311, y: 422 },         // (933, 1265) ÷3
    vivo: { x: 207, y: 281 },             // × 0.667 几何缩放
  },
  native_wechat_genderMale_816_1265: {    // 企业微信：步骤11.5 性别-男
    nova7_5g: { x: 272, y: 422 },         // (816, 1265) ÷3
    vivo: { x: 181, y: 281 },             // × 0.667 几何缩放
  },
  // estimatedX = 250 (L1103) 已改为按屏宽比例计算 screenSize.width * 0.23
};

// ============================================================================
// v3 全项目 swipe 类坐标表（10 个 stepName）
// ============================================================================

export const DEVICE_SWIPE_COORDS: Record<string, DeviceSwipeEntry> = {
  // ---- services/BaoliService.ts ----
  baoli_swipe_to_cloudhome: {       // 找云和家
    nova7_5g: { startX: 180, startY: 400, endX: 180, endY: 267 }, // (540,1200,540,800) ÷3
    vivo: { startX: 120, startY: 267, endX: 120, endY: 178 },
  },

  // ---- services/NativeAutomationService.ts ----
  native_swipe_540_1800_540_600: {
    nova7_5g: { startX: 180, startY: 600, endX: 180, endY: 200, duration: 500 },
    vivo: { startX: 120, startY: 400, endX: 120, endY: 133, duration: 500 },
  },
  native_swipe_800_600_100_600: {
    nova7_5g: { startX: 267, startY: 200, endX: 33, endY: 200, duration: 500 },
    vivo: { startX: 178, startY: 133, endX: 22, endY: 133, duration: 500 },
  },
  native_swipeUp_to_cloudHome: {    // 步骤3 上滑3次找云和家
    nova7_5g: { startX: 180, startY: 500, endX: 180, endY: 133 }, // (540,1500,540,400) ÷3
    vivo: { startX: 120, startY: 333, endX: 120, endY: 89 },
  },

  // ---- services/QianjiService.ts + workflows/qianji/steps/recognize.ts (共享) ----
  qianji_swipeUp_540_400_540_1500: {
    nova7_5g: { startX: 180, startY: 133, endX: 180, endY: 500, duration: 500 },
    vivo: { startX: 120, startY: 89, endX: 120, endY: 333, duration: 500 },
  },

  // ---- services/WorkWechatService.ts ----
  wechat_swipeUp_540_1500_540_800: {
    nova7_5g: { startX: 180, startY: 500, endX: 180, endY: 267 },
    vivo: { startX: 120, startY: 333, endX: 120, endY: 178 },
  },

  // ---- services/WechatAutomation.ts:127 下拉微信首页（v3 漏扫补遗）----
  wechat_swipeDownHome_300_200_300_800: {
    nova7_5g: { startX: 100, startY: 67, endX: 100, endY: 267, duration: 500 }, // (300,200,300,800) ÷3
    vivo: { startX: 67, startY: 44, endX: 67, endY: 178, duration: 500 },        // × 0.667 几何缩放
  },
};

// ============================================================================
// v3 全项目 longPress 类坐标表（1 个 stepName）
// ============================================================================

export const DEVICE_LONGPRESS_COORDS: Record<string, DeviceTapEntry> = {
  paste_longPress_fallback: {        // paste.ts 兜底长按（1500ms）
    nova7_5g: { x: 150, y: 267 },    // (450, 800) ÷3
    vivo: { x: 180, y: 290 },         // 老板 06-29 vivo OCR 命中 (360,581) px ÷2
  },
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 读取当前设备的多维度标识
 * 注：ro.product.model 在 vivo 上返回 'V2166A' 或 'vivo Y33s'
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

/** 判断当前设备是否 vivo（含 V2166A/Y33s/OriginOS 设备） */
function isVivoDevice(identity: string): boolean {
  if (!identity) return false;
  const lower = identity.toLowerCase();
  return lower.includes('vivo') || lower.includes('v2166a') || lower.includes('y33s') || lower.includes('origin');
}

/** 判断当前设备是否华为 nova 7 5G */
function isHuaweiNova7(identity: string): boolean {
  if (!identity) return false;
  const lower = identity.toLowerCase();
  return lower.includes('nova 7 5g') || lower.includes('nova7') || lower.includes('hwdualine') || lower.includes('hwdra');
}

/**
 * dp 坐标 → px 坐标（按屏宽归一化，360dp 基准）
 * ratio = screen.width / 360
 *   vivo V2166A 720 / 360 = 2
 *   nova 7 5G  1080 / 360 = 3
 */
export async function dpToPx(coord: DpCoord): Promise<PxCoord> {
  const screen = await zbbAutomation.getScreenSize();
  if (!screen || !screen.width) return { x: coord.x, y: coord.y };
  const ratio = screen.width / 360;
  return {
    x: Math.round(coord.x * ratio),
    y: Math.round(coord.y * ratio),
  };
}

/** swipe dp → swipe px（屏宽归一化） */
export async function swipeDpToPx(coord: SwipeDpCoord): Promise<SwipePxCoord> {
  const screen = await zbbAutomation.getScreenSize();
  if (!screen || !screen.width) return { ...coord };
  const ratio = screen.width / 360;
  return {
    startX: Math.round(coord.startX * ratio),
    startY: Math.round(coord.startY * ratio),
    endX: Math.round(coord.endX * ratio),
    endY: Math.round(coord.endY * ratio),
    duration: coord.duration,
  };
}

/**
 * 按机型选择 tap 类坐标（dp）→ 屏宽归一化转 px
 * 匹配规则：vivo 优先 → nova 7 5G → nova 7 5G 兜底（默认）
 */
export async function getTapCoord(stepName: keyof typeof DEVICE_TAP_COORDS): Promise<PxCoord> {
  const entry = DEVICE_TAP_COORDS[stepName];
  if (!entry) {
    console.warn('[deviceModel] getTapCoord 未找到 stepName:', stepName);
    return { x: 0, y: 0 };
  }
  const identity = await getDeviceIdentity();
  const dp = isVivoDevice(identity) ? entry.vivo : entry.nova7_5g;
  const px = await dpToPx(dp);
  console.log('[deviceModel] getTapCoord(' + stepName + ') dp=(' + dp.x + ',' + dp.y + ') px=(' + px.x + ',' + px.y + ')');
  return px;
}

/** 按机型选择 swipe 类坐标（dp）→ 屏宽归一化转 px */
export async function getSwipeCoord(stepName: keyof typeof DEVICE_SWIPE_COORDS): Promise<SwipePxCoord> {
  const entry = DEVICE_SWIPE_COORDS[stepName];
  if (!entry) {
    console.warn('[deviceModel] getSwipeCoord 未找到 stepName:', stepName);
    return { startX: 0, startY: 0, endX: 0, endY: 0 };
  }
  const identity = await getDeviceIdentity();
  const dp = isVivoDevice(identity) ? entry.vivo : entry.nova7_5g;
  const px = await swipeDpToPx(dp);
  console.log('[deviceModel] getSwipeCoord(' + stepName + ') px=(' + px.startX + ',' + px.startY + ')->(' + px.endX + ',' + px.endY + ')');
  return px;
}

/** 按机型选择 longPress 类坐标（dp）→ 屏宽归一化转 px */
export async function getLongPressCoord(stepName: keyof typeof DEVICE_LONGPRESS_COORDS): Promise<PxCoord> {
  const entry = DEVICE_LONGPRESS_COORDS[stepName];
  if (!entry) {
    console.warn('[deviceModel] getLongPressCoord 未找到 stepName:', stepName);
    return { x: 0, y: 0 };
  }
  const identity = await getDeviceIdentity();
  const dp = isVivoDevice(identity) ? entry.vivo : entry.nova7_5g;
  const px = await dpToPx(dp);
  console.log('[deviceModel] getLongPressCoord(' + stepName + ') px=(' + px.x + ',' + px.y + ')');
  return px;
}

// ============================================================================
// v2 兼容 API（不破坏老调用）
// ============================================================================

/**
 * 按机型匹配 Recents 页"全部清除"按钮 dp 坐标（v2 兼容）
 * @deprecated v3 起请用 getTapCoord('clearRecentTasks')（TODO 待加）
 */
export async function getClearRecentTasksCoord(): Promise<ClearRecentTasksCoord> {
  const identity = await getDeviceIdentity();
  if (!identity) {
    console.warn('[deviceModel] 设备标识为空，使用 fallback (265, 730) dp');
    return CLEAR_DEFAULT_FALLBACK;
  }
  for (const key of Object.keys(DEVICE_CLEAR_RECENT_TASKS_COORDS)) {
    if (identity.toLowerCase().includes(key.toLowerCase())) {
      const coord = DEVICE_CLEAR_RECENT_TASKS_COORDS[key];
      console.log('[deviceModel] 命中 Recents 清除按钮规则 "' + key + '" → (' + coord.x + ', ' + coord.y + ') dp');
      return coord;
    }
  }
  console.warn('[deviceModel] 未匹配任何 Recents 清除按钮规则，使用 fallback (265, 730) dp');
  return CLEAR_DEFAULT_FALLBACK;
}

/**
 * 按机型匹配弹窗"粘贴"按钮 dp 坐标（v2 兼容）
 * @deprecated v3 起请用 getTapCoord('pasteMenu')（TODO 待加）
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
