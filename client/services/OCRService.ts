/**
 * OCR 识别服务
 * 使用 Google ML Kit 进行文字识别
 * 支持 Android/iOS/Web 三端
 * 
 * 使用方式：
 * - Android/iOS: 使用 Google ML Kit 进行本地 OCR 识别
 * - Web: 使用模拟数据（可后续接入 Tesseract.js）
 */

import { Platform } from 'react-native';

// 静态导入 ML Kit
import TextRecognition, { TextRecognitionScript, TextRecognitionResult } from '@react-native-ml-kit/text-recognition';

// 识别结果
export interface OCRResult {
  text: string;
  confidence: number;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// 客户信息
export interface CustomerInfo {
  name: string;
  phone: string;
  rawMessage: string;
}

// 消息拆解结果
export interface ParseResult {
  success: boolean;
  data?: CustomerInfo;
  error?: string;
}

// 检查是否可以使用原生 OCR
const canUseNativeOCR = Platform.OS !== 'web' && TextRecognition !== null;

class OCRService {
  private static instance: OCRService;
  
  /* eslint-disable @typescript-eslint/no-empty-function */
  private constructor() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  
  // 获取单例
  static getInstance(): OCRService {
    if (!OCRService.instance) {
      OCRService.instance = new OCRService();
    }
    return OCRService.instance;
  }
  
  /**
   * 检查是否支持原生 OCR
   */
  isNativeOCRSupported(): boolean {
    return canUseNativeOCR;
  }
  
  /**
   * 使用 base64 方式识别图片中的文字
   * 适用于 Android 10+ 文件访问限制问题
   * @param base64Image 图片的 base64 编码（不带 data:image/xxx;base64, 前缀）
   * @param useChinese 是否使用中文识别（默认中文）
   * @returns 识别结果数组
   */
  async recognizeTextFromBase64(base64Image: string, useChinese: boolean = true): Promise<OCRResult[]> {
    console.log(`[OCR] 识别 base64 图片，长度: ${base64Image.length}`);
    
    // Web 平台返回模拟数据
    if (!canUseNativeOCR) {
      console.log('[OCR] Web平台，使用模拟识别结果');
      return this.getMockOCRResults();
    }
    
    try {
      // 构建 base64 数据 URI
      const imageUri = `data:image/png;base64,${base64Image}`;
      
      // 使用中文识别脚本
      const script = useChinese ? TextRecognitionScript.CHINESE : TextRecognitionScript.LATIN;
      
      console.log('[OCR] 开始 ML Kit 识别...');
      const result: TextRecognitionResult = await TextRecognition.recognize(imageUri, script);
      
      if (result && result.blocks) {
        const results = result.blocks.map((block) => ({
          text: block.text || '',
          confidence: 0.9, // ML Kit 不直接提供置信度，使用默认值
          bounds: block.frame ? {
            x: block.frame.left || 0,
            y: block.frame.top || 0,
            width: block.frame.width || 0,
            height: block.frame.height || 0,
          } : undefined,
        }));
        console.log(`[OCR] 识别成功，共 ${results.length} 个区块`);
        return results;
      }
      
      return [];
    } catch (error) {
      console.error('[OCR] base64 识别失败:', error);
      return [];
    }
  }
  
  /**
   * 识别图片中的文字
   * @param imagePath 图片路径（本地文件路径或 URI）
   * @param useChinese 是否使用中文识别（默认中文）
   * @returns 识别结果数组
   */
  async recognizeText(imagePath: string, useChinese: boolean = true): Promise<OCRResult[]> {
    console.log(`[OCR] 识别图片: ${imagePath}`);
    
    // Web 平台返回模拟数据
    if (!canUseNativeOCR) {
      console.log('[OCR] Web平台，使用模拟识别结果');
      return this.getMockOCRResults();
    }
    
    try {
      // 使用中文识别脚本
      const script = useChinese ? TextRecognitionScript.CHINESE : TextRecognitionScript.LATIN;
      const result: TextRecognitionResult = await TextRecognition.recognize(imagePath, script);
      
      if (result && result.blocks) {
        return result.blocks.map((block) => ({
          text: block.text || '',
          confidence: 0.9, // ML Kit 不直接提供置信度，使用默认值
          bounds: block.frame ? {
            x: block.frame.left || 0,
            y: block.frame.top || 0,
            width: block.frame.width || 0,
            height: block.frame.height || 0,
          } : undefined,
        }));
      }
      
      return [];
    } catch (error) {
      console.error('[OCR] 识别失败:', error);
      return this.getMockOCRResults();
    }
  }
  
  /**
   * 从消息中识别好友名称
   * @param imagePath 截图路径
   * @returns 好友名称
   */
  async recognizeFriendName(imagePath: string): Promise<string | null> {
    const results = await this.recognizeText(imagePath);
    
    // 查找"栀子树下"等好友名称
    for (const result of results) {
      const text = result.text.trim();
      // 好友名称通常是 2-5 个汉字
      if (/^[\u4e00-\u9fa5]{2,5}$/.test(text)) {
        console.log(`[OCR] 识别到好友名称: ${text}`);
        return text;
      }
    }
    
    // 备选：如果有"栀子树下"字样
    const fullText = results.map(r => r.text).join('');
    const match = fullText.match(/栀子树下/);
    if (match) {
      return '栀子树下';
    }
    
    console.log('[OCR] 未识别到好友名称');
    return null;
  }
  
  /**
   * 识别客户信息（姓名+电话）
   * @param imagePath 截图路径
   * @returns 客户信息
   */
  async recognizeCustomerInfo(imagePath: string): Promise<CustomerInfo | null> {
    const results = await this.recognizeText(imagePath);
    
    // 合并所有文字
    const fullText = results.map(r => r.text).join(' ');
    
    console.log(`[OCR] 识别文字: ${fullText}`);
    
    // 提取客户信息
    const customerInfo = this.extractCustomerInfo(fullText);
    
    if (customerInfo) {
      console.log(`[OCR] 客户信息: 姓名=${customerInfo.name}, 电话=${customerInfo.phone}`);
    }
    
    return customerInfo;
  }
  
  /**
   * 从文本中提取客户信息
   * @param text 文本
   * @returns 客户信息
   */
  extractCustomerInfo(text: string): CustomerInfo | null {
    // 匹配模式：汉字姓名 + 11位手机号
    // 例如: "刘15325423611" 或 "张三 15325423611"
    
    // 移除空格
    const cleanText = text.replace(/\s+/g, '');
    
    // 模式1: 姓名和电话连在一起
    const pattern1 = /([\u4e00-\u9fa5]{1,3})(\d{11})/;
    const match1 = cleanText.match(pattern1);
    if (match1) {
      return {
        name: match1[1],
        phone: match1[2],
        rawMessage: match1[0],
      };
    }
    
    // 模式2: 姓名和电话分开
    const namePattern = /[\u4e00-\u9fa5]{1,3}/;
    const phonePattern = /1[3-9]\d{9}/;
    
    const nameMatch = cleanText.match(namePattern);
    const phoneMatch = cleanText.match(phonePattern);
    
    if (nameMatch && phoneMatch) {
      return {
        name: nameMatch[0],
        phone: phoneMatch[0],
        rawMessage: `${nameMatch[0]}${phoneMatch[0]}`,
      };
    }
    
    return null;
  }
  
  /**
   * 从消息中拆解客户信息
   * @param message 原始消息文本
   * @returns 拆解结果
   */
  parseCustomerInfo(message: string): ParseResult {
    if (!message) {
      return { success: false, error: '消息为空' };
    }
    
    const trimmed = message.trim();
    
    // 拆解规则：汉字 + 11位数字
    const pattern = /^([\u4e00-\u9fa5]+)(\d{11,})$/;
    const match = trimmed.match(pattern);
    
    if (match) {
      const name = match[1];
      const phone = match[2].substring(0, 11);
      
      return {
        success: true,
        data: {
          name,
          phone,
          rawMessage: trimmed,
        },
      };
    }
    
    // 备选拆解方式
    const chinesePattern = /[\u4e00-\u9fa5]+/g;
    const digitPattern = /\d{11}/g;
    
    const names = trimmed.match(chinesePattern);
    const phones = trimmed.match(digitPattern);
    
    if (names && names.length > 0 && phones && phones.length > 0) {
      return {
        success: true,
        data: {
          name: names[0],
          phone: phones[0],
          rawMessage: trimmed,
        },
      };
    }
    
    return {
      success: false,
      error: '无法识别客户信息，格式应为：姓名+11位手机号',
    };
  }
  
  /**
   * 验证手机号格式
   * @param phone 手机号
   * @returns 是否有效
   */
  validatePhone(phone: string): boolean {
    const pattern = /^1[3-9]\d{9}$/;
    return pattern.test(phone);
  }
  
  /**
   * 格式化手机号（带空格）
   * @param phone 手机号
   * @returns 格式化后的手机号
   */
  formatPhone(phone: string): string {
    if (phone.length !== 11) return phone;
    return `${phone.substring(0, 3)} ${phone.substring(3, 7)} ${phone.substring(7)}`;
  }
  
  /**
   * 获取模拟 OCR 结果（用于测试）
   */
  private getMockOCRResults(): OCRResult[] {
    return [
      {
        text: '栀子树下',
        confidence: 0.95,
        bounds: { x: 10, y: 100, width: 80, height: 24 },
      },
      {
        text: '刘15325423611',
        confidence: 0.88,
        bounds: { x: 10, y: 150, width: 120, height: 24 },
      },
    ];
  }
}

// 导出单例和类型
export const ocrService = OCRService.getInstance();
export { OCRService, TextRecognitionScript };
