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

export { screenshotService, ScreenshotService } from './ScreenshotService';
export type { ScreenshotInfo as SSInfo } from './ScreenshotService';

export { baoliService, BaoliService } from './BaoliService';
export { calibrationService, CalibrationService } from './CalibrationService';
export type { CalibrationCoords, CalibrationData } from './CalibrationService';

// 2026-06-25 瘦身：以下老 v2.5 链路服务已废
//   WechatAutomation / DouyinAutomation / ZBBFlowService / NativeAutomationService / WorkWechatService
// 文件保留清空，git 历史可恢复。需要老链路时从 git revert 恢复即可。

/** 认证模块 */
export { AuthApi } from '../src/api/AuthApi';
export type { RegisterReq, LoginReq, User, AuthResponse } from '../src/api/AuthApi';
export {
  AuthService,
  checkAuth,
  saveToken,
  getToken,
  clearToken,
  login,
  register,
  logout,
  fetchMe,
  updateProfile,
  changePassword,
} from '../src/services/AuthService';
