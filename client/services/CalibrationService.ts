/**
 * ZBB 自动化校准服务
 * 用于首次安装/更新时校准桌面图标和按钮的精确坐标
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { zbbAutomation } from '../native';

const CALIBRATION_KEY = 'zbb_calibration_done';
const GREEN_CLOUD_KEY = 'zbb_green_cloud_coords';
const RECOMMEND_BTN_KEY = 'zbb_recommend_btn_coords';

export interface CalibrationCoords {
  x: number;
  y: number;
  timestamp: number;
}

export interface CalibrationData {
  isCalibrated: boolean;
  greenCloud: CalibrationCoords | null;
  recommendBtn: CalibrationCoords | null;
}

/**
 * 校准服务
 */
class CalibrationService {
  private static instance: CalibrationService;
  
  private constructor() {}
  
  static getInstance(): CalibrationService {
    if (!CalibrationService.instance) {
      CalibrationService.instance = new CalibrationService();
    }
    return CalibrationService.instance;
  }
  
  /**
   * 检查是否需要校准
   * 每次安装/更新后都需要重新校准
   */
  async needsCalibration(): Promise<boolean> {
    try {
      const calibrated = await AsyncStorage.getItem(CALIBRATION_KEY);
      if (calibrated !== 'true') {
        return true;
      }
      
      // 检查坐标是否存在
      const greenCloud = await AsyncStorage.getItem(GREEN_CLOUD_KEY);
      const recommendBtn = await AsyncStorage.getItem(RECOMMEND_BTN_KEY);
      
      if (!greenCloud || !recommendBtn) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[Calibration] 检查校准状态失败:', error);
      return true;
    }
  }
  
  /**
   * 获取已保存的校准数据
   */
  async getCalibrationData(): Promise<CalibrationData> {
    try {
      const greenCloud = await AsyncStorage.getItem(GREEN_CLOUD_KEY);
      const recommendBtn = await AsyncStorage.getItem(RECOMMEND_BTN_KEY);
      const calibrated = await AsyncStorage.getItem(CALIBRATION_KEY);
      
      return {
        isCalibrated: calibrated === 'true',
        greenCloud: greenCloud ? JSON.parse(greenCloud) : null,
        recommendBtn: recommendBtn ? JSON.parse(recommendBtn) : null,
      };
    } catch (error) {
      console.error('[Calibration] 获取校准数据失败:', error);
      return {
        isCalibrated: false,
        greenCloud: null,
        recommendBtn: null,
      };
    }
  }
  
  /**
   * 获取新绿城云坐标（用于主流程）
   */
  async getGreenCloudCoords(): Promise<CalibrationCoords | null> {
    const data = await this.getCalibrationData();
    return data.greenCloud;
  }
  
  /**
   * 获取我要推荐按钮坐标（用于主流程）
   */
  async getRecommendBtnCoords(): Promise<CalibrationCoords | null> {
    const data = await this.getCalibrationData();
    return data.recommendBtn;
  }
  
  /**
   * 保存新绿城云坐标
   */
  async saveGreenCloudCoords(x: number, y: number): Promise<void> {
    try {
      const coords: CalibrationCoords = {
        x,
        y,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(GREEN_CLOUD_KEY, JSON.stringify(coords));
      console.log('[Calibration] 新绿城云坐标已保存:', coords);
    } catch (error) {
      console.error('[Calibration] 保存新绿城云坐标失败:', error);
      throw error;
    }
  }
  
  /**
   * 保存我要推荐按钮坐标
   */
  async saveRecommendBtnCoords(x: number, y: number): Promise<void> {
    try {
      const coords: CalibrationCoords = {
        x,
        y,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(RECOMMEND_BTN_KEY, JSON.stringify(coords));
      console.log('[Calibration] 我要推荐按钮坐标已保存:', coords);
    } catch (error) {
      console.error('[Calibration] 保存我要推荐按钮坐标失败:', error);
      throw error;
    }
  }
  
  /**
   * 完成校准
   */
  async completeCalibration(): Promise<void> {
    try {
      await AsyncStorage.setItem(CALIBRATION_KEY, 'true');
      console.log('[Calibration] 校准完成');
    } catch (error) {
      console.error('[Calibration] 保存校准状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 重置校准（用于调试或重新校准）
   */
  async resetCalibration(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CALIBRATION_KEY);
      await AsyncStorage.removeItem(GREEN_CLOUD_KEY);
      await AsyncStorage.removeItem(RECOMMEND_BTN_KEY);
      console.log('[Calibration] 校准已重置');
    } catch (error) {
      console.error('[Calibration] 重置校准失败:', error);
      throw error;
    }
  }
  
  /**
   * 清除原生层的点击历史
   */
  async clearNativeClickHistory(): Promise<void> {
    try {
      await zbbAutomation.clearClickHistory();
      console.log('[Calibration] 原生点击历史已清除');
    } catch (error) {
      console.error('[Calibration] 清除原生点击历史失败:', error);
    }
  }
  
  /**
   * 等待并获取用户点击坐标
   * 通过轮询原生层记录的点击事件来获取坐标
   * @param timeoutMs 超时时间（毫秒）
   * @returns 点击坐标或 null（超时）
   */
  async waitForUserClick(timeoutMs: number = 30000): Promise<{ x: number; y: number } | null> {
    console.log('[Calibration] 开始等待用户点击，超时时间:', timeoutMs);
    
    // 清除之前的点击历史
    await this.clearNativeClickHistory();
    
    const startTime = Date.now();
    const pollInterval = 300; // 轮询间隔
    const maxPolls = Math.ceil(timeoutMs / pollInterval);
    
    for (let i = 0; i < maxPolls; i++) {
      // 检查是否超时
      if (Date.now() - startTime > timeoutMs) {
        console.log('[Calibration] 等待用户点击超时');
        return null;
      }
      
      // 获取最近的点击坐标
      try {
        const result = await zbbAutomation.getRecentClick(5000); // 5秒内的点击
        
        if (result.found && result.x !== undefined && result.y !== undefined) {
          console.log('[Calibration] 检测到用户点击:', result);
          return { x: result.x, y: result.y };
        }
      } catch (error) {
        console.error('[Calibration] 获取点击坐标失败:', error);
      }
      
      // 等待一段时间再检查
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    console.log('[Calibration] 等待用户点击超时（轮询结束）');
    return null;
  }
  
  /**
   * 获取最后记录的点击坐标
   */
  async getLastClickCoordinates(): Promise<{ x: number; y: number } | null> {
    try {
      const result = await zbbAutomation.getLastClickCoordinates();
      if (result.found && result.x !== undefined && result.y !== undefined) {
        return { x: result.x, y: result.y };
      }
      return null;
    } catch (error) {
      console.error('[Calibration] 获取最后点击坐标失败:', error);
      return null;
    }
  }
}

export const calibrationService = CalibrationService.getInstance();
export { CalibrationService };
export default calibrationService;
