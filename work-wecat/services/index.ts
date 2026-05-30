/**
 * 服务模块导出
 */

export { automationEngine, AutomationEngine } from './AutomationEngine';
export type { 
  FlowConfig, 
  StepInfo, 
  LogEntry, 
  CustomerInfo, 
  ScreenshotInfo, 
  FlowPhase 
} from './AutomationEngine';

export { ocrService, OCRService } from './OCRService';
export type { OCRResult, ParseResult } from './OCRService';

export { screenshotService, ScreenshotService } from './ScreenshotService';
export type { ScreenshotInfo as SSInfo } from './ScreenshotService';

export { wechatAutomation, WechatAutomation } from './WechatAutomation';
export type { WechatPhase } from './WechatAutomation';

export { douyinAutomation, DouyinAutomation } from './DouyinAutomation';
export type { DouyinPhase } from './DouyinAutomation';

export { zbbFlowService, ZBBFlowService } from './ZBBFlowService';
export type { FlowResult, ZBBStatus, ZBBPhase } from './ZBBFlowService';

export { nativeAutomationService, NativeAutomationService } from './NativeAutomationService';

export { calibrationService, CalibrationService } from './CalibrationService';
export type { CalibrationCoords, CalibrationData } from './CalibrationService';
