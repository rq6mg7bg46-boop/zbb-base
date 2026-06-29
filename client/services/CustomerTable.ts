/**
 * 客户信息存储模块
 * 用于记录从抖音复制来的客户信息
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CustomerRecord {
  id: number;           // 序号（自增）
  copyDateTime: string; // 复制日期时间 (YYYY-MM-DD HH:mm:ss)
  customerName: string;  // 客户姓名（姓氏+称呼）
  customerGender: string; // 性别（先生/女士）
  phone: string;        // 电话号码
  projectType: string;  // 项目类型（baoli/yuexiu）
  rawData: string;      // 原始数据
  status: 'pending' | 'completed' | 'failed'; // 状态
  createTime: number;   // 创建时间戳
}

class CustomerTable {
  private static instance: CustomerTable;
  private records: CustomerRecord[] = [];
  private nextId: number = 1;

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): CustomerTable {
    if (!CustomerTable.instance) {
      CustomerTable.instance = new CustomerTable();
    }
    return CustomerTable.instance;
  }

  /**
   * 从本地存储加载数据
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem('customer_table');
      if (data) {
        const parsed = JSON.parse(data);
        this.records = parsed.records || [];
        this.nextId = parsed.nextId || 1;
      }
    } catch (error) {
      console.log('[CustomerTable] 加载本地存储失败:', error);
    }
  }

  /**
   * 保存到本地存储
   */
  private async saveToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem('customer_table', JSON.stringify({
        records: this.records,
        nextId: this.nextId
      }));
    } catch (error) {
      console.log('[CustomerTable] 保存本地存储失败:', error);
    }
  }

  /**
   * 添加客户记录
   */
  async addRecord(rawData: string, projectType: string = ''): Promise<CustomerRecord | null> {
    // 解析原始数据
    const parsed = this.parseCustomerData(rawData);
    if (!parsed) {
      console.log('[CustomerTable] 解析客户数据失败:', rawData);
      return null;
    }

    const now = new Date();
    const record: CustomerRecord = {
      id: this.nextId++,
      copyDateTime: this.formatDateTime(now),
      customerName: parsed.customerName,
      customerGender: parsed.customerGender,
      phone: parsed.phone,
      projectType: projectType,
      rawData: rawData,
      status: 'pending',
      createTime: now.getTime()
    };

    this.records.unshift(record); // 添加到数组开头（最新）
    await this.saveToStorage();
    
    console.log('[CustomerTable] 添加记录:', record);
    return record;
  }

  /**
   * 解析客户数据
   * 格式: "刘15325423611" 或 "张女士13812345678"
   */
  private parseCustomerData(rawData: string): { customerName: string; customerGender: string; phone: string } | null {
    const phonePattern = /1[3-9]\d{9}/;
    const phoneMatch = rawData.match(phonePattern);
    
    if (!phoneMatch) {
      return null;
    }

    const phone = phoneMatch[0];
    const phoneIndex = rawData.indexOf(phone);
    
    // 姓名前面的部分
    const beforePhone = rawData.substring(0, phoneIndex).trim();
    
    // 尝试提取姓氏和性别
    let surname = '未知';
    let gender = '先生'; // 默认男性
    
    // 匹配"女士"或"先生"前的一个汉字
    const genderMatch = beforePhone.match(/([\u4e00-\u9fa5])(女士|先生)$/);
    
    if (genderMatch) {
      surname = genderMatch[1]; // "女士"或"先生"前的一个汉字
      gender = genderMatch[2]; // "女士"或"先生"
    } else {
      // 默认取第一个汉字作为姓氏
      const hanziMatch = beforePhone.match(/[\u4e00-\u9fa5]/);
      surname = hanziMatch ? hanziMatch[0] : '未知';
    }
    
    return {
      customerName: surname + gender,
      customerGender: gender,
      phone: phone
    };
  }

  /**
   * 格式化日期时间
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 获取最新一条待录入的客户信息
   */
  getLatestPending(): CustomerRecord | null {
    return this.records.find(r => r.status === 'pending') || null;
  }

  /**
   * 获取最新一条客户信息（不管状态）
   */
  getLatest(): CustomerRecord | null {
    return this.records.length > 0 ? this.records[0] : null;
  }

  /**
   * 更新记录状态
   */
  async updateStatus(id: number, status: CustomerRecord['status']): Promise<void> {
    const record = this.records.find(r => r.id === id);
    if (record) {
      record.status = status;
      await this.saveToStorage();
      console.log('[CustomerTable] 更新状态:', id, status);
    }
  }

  /**
   * 获取所有记录
   */
  getAllRecords(): CustomerRecord[] {
    return [...this.records];
  }

  /**
   * 获取记录数量
   */
  getCount(): number {
    return this.records.length;
  }

  /**
   * 清空所有记录
   */
  async clearAll(): Promise<void> {
    this.records = [];
    this.nextId = 1;
    await this.saveToStorage();
    console.log('[CustomerTable] 已清空所有记录');
  }

  /**
   * 删除指定记录
   */
  async deleteRecord(id: number): Promise<void> {
    this.records = this.records.filter(r => r.id !== id);
    await this.saveToStorage();
  }

  /**
   * 打印所有记录到控制台（调试用）
   */
  printAllRecords(): void {
    console.log('========== 客户信息表格 ==========');
    console.log('总计: ' + this.records.length + ' 条记录');
    console.log('');
    
    if (this.records.length === 0) {
      console.log('(空表格，无数据)');
    } else {
      console.log('| 序号 | 复制时间            | 姓名   | 性别 | 电话        | 项目   | 状态     |');
      console.log('|------|---------------------|--------|------|-------------|--------|----------|');
      for (const record of this.records) {
        const projectName = record.projectType === 'baoli' ? '保利' : record.projectType === 'yuexiu' ? '越秀' : '';
        console.log(
          '| ' + String(record.id).padEnd(4) + ' | ' +
          (record.copyDateTime || '').padEnd(19) + ' | ' +
          (record.customerName || '').padEnd(6) + ' | ' +
          (record.customerGender || '').padEnd(4) + ' | ' +
          (record.phone || '').padEnd(11) + ' | ' +
          projectName.padEnd(6) + ' | ' +
          (record.status || '').padEnd(8) + ' |'
        );
      }
    }
    
    console.log('');
    console.log('=================================');
  }

  /**
   * 获取表格统计信息
   */
  getStats(): { total: number; pending: number; completed: number; failed: number } {
    return {
      total: this.records.length,
      pending: this.records.filter(r => r.status === 'pending').length,
      completed: this.records.filter(r => r.status === 'completed').length,
      failed: this.records.filter(r => r.status === 'failed').length
    };
  }
}

export const customerTable = CustomerTable.getInstance();
