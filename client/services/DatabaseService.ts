/**
 * ZBB 数据库服务
 * 统一管理所有报备记录（越秀端 + 保利端）
 * 表名：reports
 * project_type: 'baoli' | 'yuexiu'
 */
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'zbb_reports.db';
let db: SQLite.SQLiteDatabase | null = null;

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<void> {
  try {
    console.log('[ZBB DB] 开始初始化数据库...');
    console.log('[ZBB DB] expo-sqlite API:', typeof SQLite.openDatabaseAsync);

    try {
      db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      console.log('[ZBB DB] openDatabaseAsync 成功');
      // 调试：打印数据库实际路径
      const dbPath = await (db as any).getDatabasePath?.();
      console.log('[ZBB DB] 实际文件路径:', dbPath);
    } catch (openError: any) {
      console.error('[ZBB DB] openDatabaseAsync 失败:', openError.message);
      throw openError;  // openDatabaseAsync 是 expo-sqlite v16+ 唯一 API，失败直接抛错
    }

    if (!db) {
      throw new Error('数据库实例为 null');
    }
    
    // 检查 reports 表是否存在
    const tableCheck = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='reports'"
    );
    
    if (tableCheck) {
      // 表已存在，检查字段并升级
      const columns = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(reports)"
      );
      const columnNames = columns.map(c => c.name);
      console.log('[ZBB DB] 当前表字段:', columnNames.join(', '));

      // 定义所有需要升级的字段（带默认值，兼容旧数据）
      const fieldUpgrades: Array<{name: string; sql: string}> = [
        // 统一字段
        { name: 'project_type', sql: "ALTER TABLE reports ADD COLUMN project_type TEXT NOT NULL DEFAULT 'baoli'" },
        { name: 'full_record', sql: "ALTER TABLE reports ADD COLUMN full_record TEXT" },
        { name: 'copy_time', sql: "ALTER TABLE reports ADD COLUMN copy_time TEXT NOT NULL DEFAULT ''" },
        // 公司信息
        { name: 'company_name', sql: "ALTER TABLE reports ADD COLUMN company_name TEXT DEFAULT '贝壳'" },
        // 保利字段（越秀可为空）
        { name: 'customer_name', sql: "ALTER TABLE reports ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''" },
        { name: 'customer_gender', sql: "ALTER TABLE reports ADD COLUMN customer_gender TEXT NOT NULL DEFAULT ''" },
        { name: 'customer_phone', sql: "ALTER TABLE reports ADD COLUMN customer_phone TEXT NOT NULL DEFAULT ''" },
        { name: 'report_project', sql: "ALTER TABLE reports ADD COLUMN report_project TEXT NOT NULL DEFAULT ''" },
        { name: 'property_type', sql: "ALTER TABLE reports ADD COLUMN property_type TEXT DEFAULT '住宅'" },
        { name: 'report_submit_time', sql: "ALTER TABLE reports ADD COLUMN report_submit_time TEXT" },
        { name: 'expected_visit_time', sql: "ALTER TABLE reports ADD COLUMN expected_visit_time TEXT" },
        { name: 'agent_name', sql: "ALTER TABLE reports ADD COLUMN agent_name TEXT" },
        { name: 'agent_remark', sql: "ALTER TABLE reports ADD COLUMN agent_remark TEXT" },
        { name: 'city', sql: "ALTER TABLE reports ADD COLUMN city TEXT DEFAULT ''" },
        { name: 'status', sql: "ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'pending'" },
        { name: 'created_at', sql: "ALTER TABLE reports ADD COLUMN created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)" },
      ];

      // 逐个检查并添加缺失字段
      for (const field of fieldUpgrades) {
        if (!columnNames.includes(field.name)) {
          try {
            console.log(`[ZBB DB] 添加 ${field.name} 字段...`);
            await db.execAsync(field.sql);
            console.log(`[ZBB DB] ✓ ${field.name} 字段已添加`);
            columnNames.push(field.name);
          } catch (addError: any) {
            if (addError.message?.includes('duplicate column')) {
              console.log(`[ZBB DB] ${field.name} 字段已存在，跳过`);
            } else {
              throw addError;
            }
          }
        }
      }
      
      console.log('[ZBB DB] ✓ reports 表升级完成');
    } else {
      // 表不存在，创建新表
      console.log('[ZBB DB] reports 表不存在，创建新表...');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_name TEXT DEFAULT '贝壳',
          customer_name TEXT NOT NULL,
          customer_gender TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          report_project TEXT NOT NULL,
          property_type TEXT DEFAULT '住宅',
          report_submit_time TEXT,
          expected_visit_time TEXT,
          agent_name TEXT,
          agent_remark TEXT,
          project_type TEXT NOT NULL DEFAULT 'baoli',
          full_record TEXT,
          status TEXT DEFAULT 'pending',
          copy_time TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        );
      `);
      console.log('[ZBB DB] ✓ reports 表创建成功');
    }
    
    // 删除旧的表（如果存在）
    try {
      await db.execAsync('DROP TABLE IF EXISTS yuexiu_reports;');
      await db.execAsync('DROP TABLE IF EXISTS baoli_reports;');
      console.log('[ZBB DB] ✓ 旧表已清理');
    } catch (e) {
      // 旧表不存在，忽略
    }
    
    console.log('[ZBB DB] ✓ 数据库初始化成功');
  } catch (error) {
    console.error('[ZBB DB] ✗ 数据库初始化失败:', error);
    throw error;
  }
}

// ==================== 通用操作 ====================

/**
 * 插入报备记录
 * @param data 报备数据
 * @param projectType 项目类型: 'baoli' | 'yuexiu'
 */
export async function insertReport(
  data: {
    customerName: string;
    customerGender: string;
    customerPhone: string;
    reportProject: string;
    propertyType?: string;
    reportSubmitTime?: string;
    expectedVisitTime?: string;
    agentName?: string;
    agentRemark?: string;
    city?: string;
  },
  projectType: 'baoli' | 'yuexiu',
  fullRecord?: string,
  copyTime?: string
): Promise<number> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const createdAt = Date.now();
    const now = copyTime || new Date().toLocaleString('zh-CN');
    
    const result = await db!.runAsync(
      `INSERT INTO reports (
        company_name, customer_name, customer_gender, customer_phone,
        report_project, property_type, report_submit_time, expected_visit_time,
        agent_name, agent_remark, city, project_type, full_record, status, copy_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '贝壳',
        data.customerName,
        data.customerGender,
        data.customerPhone,
        data.reportProject,
        data.propertyType || '住宅',
        data.reportSubmitTime || '',
        data.expectedVisitTime || '',
        data.agentName || '',
        data.agentRemark || '',
        data.city || '',
        projectType,
        fullRecord || '',
        'pending',
        now,
        createdAt
      ]
    );
    
    console.log(`[数据库] 插入记录: ${data.customerName} (${data.customerGender}) @ ${data.reportProject} [${projectType}], ID=${result.lastInsertRowId}`);
    
    return result.lastInsertRowId;
  } catch (error) {
    console.error('[数据库] 插入记录失败:', error);
    throw error;
  }
}

/**
 * 获取所有报备记录
 */
export async function getAllReports(): Promise<any[]> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const rows = await db!.getAllAsync('SELECT * FROM reports ORDER BY created_at DESC');
    console.log(`[数据库] 查询记录: 共${rows.length}条`);
    return rows;
  } catch (error) {
    console.error('[数据库] 查询记录失败:', error);
    throw error;
  }
}

/**
 * 获取指定项目类型的待报备记录
 * @param projectType 项目类型: 'baoli' | 'yuexiu'
 */
export async function getReportsByType(projectType: 'baoli' | 'yuexiu'): Promise<any[]> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const rows = await db!.getAllAsync(
      `SELECT * FROM reports WHERE project_type = ? AND status = 'pending' ORDER BY created_at DESC`,
      [projectType]
    );
    console.log(`[数据库] 查询[${projectType}]待报备记录: 共${rows.length}条`);
    return rows;
  } catch (error) {
    console.error(`[数据库] 查询[${projectType}]记录失败:`, error);
    throw error;
  }
}

/**
 * 获取最新的一条记录
 */
export async function getLatestReport(): Promise<any | null> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const result = await db!.getFirstAsync<any>(
      'SELECT * FROM reports ORDER BY id DESC LIMIT 1'
    );
    
    if (!result) {
      return null;
    }
    
    console.log(`[数据库] 获取最新记录: ID=${result.id}`);
    return result;
  } catch (error) {
    console.error('[数据库] 获取最新记录失败:', error);
    throw error;
  }
}

/**
 * 按类型获取最新的一条待处理记录
 */
export async function getLatestReportByType(projectType: string): Promise<any | null> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const result = await db!.getFirstAsync<any>(
      "SELECT * FROM reports WHERE project_type = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [projectType]
    );
    
    if (!result) {
      console.log(`[数据库] 没有待处理的${projectType}记录`);
      return null;
    }
    
    console.log(`[数据库] 获取最新${projectType}待处理记录: ID=${result.id}`);
    return result;
  } catch (error) {
    console.error(`[数据库] 获取最新${projectType}记录失败:`, error);
    throw error;
  }
}

/**
 * 更新记录状态
 */
export async function updateReportStatus(
  id: number,
  status: string,
  reportTime?: string
): Promise<void> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    if (reportTime) {
      await db!.runAsync(
        'UPDATE reports SET status = ?, report_time = ? WHERE id = ?',
        [status, reportTime, id]
      );
    } else {
      await db!.runAsync(
        'UPDATE reports SET status = ? WHERE id = ?',
        [status, id]
      );
    }
    console.log(`[数据库] 更新记录状态: ID=${id}, status=${status}`);
  } catch (error) {
    console.error('[数据库] 更新记录状态失败:', error);
    throw error;
  }
}

/**
 * 删除记录
 */
export async function deleteReport(id: number): Promise<void> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    await db!.runAsync('DELETE FROM reports WHERE id = ?', [id]);
    console.log(`[数据库] 删除记录: ID=${id}`);
  } catch (error) {
    console.error('[数据库] 删除记录失败:', error);
    throw error;
  }
}

/**
 * 获取今日完成报备数量
 */
export async function getTodayReportCount(projectType?: 'baoli' | 'yuexiu'): Promise<number> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const today = new Date().toLocaleDateString('zh-CN');
    let sql = 'SELECT COUNT(*) as count FROM reports WHERE status = \'done\'';
    const params: any[] = [];
    
    if (projectType) {
      sql += ' AND project_type = ?';
      params.push(projectType);
    }
    
    const result = await db!.getFirstAsync<{ count: number }>(sql, params);
    return result?.count || 0;
  } catch (error) {
    console.error('[数据库] 查询今日完成数失败:', error);
    return 0;
  }
}

// 别名函数，保持向后兼容
export async function getTodayBaoliReportCount(): Promise<number> {
  return getTodayReportCount('baoli');
}

export async function getTodayYuexiuReportCount(): Promise<number> {
  return getTodayReportCount('yuexiu');
}

/**
 * 统计记录数量
 */
export async function getReportStats(): Promise<{ total: number; pending: number; done: number }> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const total = await db!.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM reports'
    );
    const pending = await db!.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM reports WHERE status = \'pending\''
    );
    const done = await db!.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM reports WHERE status = \'done\''
    );
    
    return {
      total: total?.count || 0,
      pending: pending?.count || 0,
      done: done?.count || 0
    };
  } catch (error) {
    console.error('[数据库] 统计记录失败:', error);
    return { total: 0, pending: 0, done: 0 };
  }
}

// ==================== 越秀端兼容 ====================

/**
 * 插入越秀报备记录（兼容旧代码）
 */
export async function insertYuexiuReport(data: {
  surname: string;
  gender: string;
  phone: string;
  fullRecord?: string;
  copyTime?: string;
}): Promise<number> {
  return insertReport(
    {
      customerName: data.surname,
      customerGender: data.gender,
      customerPhone: data.phone,
      reportProject: '越秀',
    },
    'yuexiu',
    data.fullRecord,
    data.copyTime
  );
}

/**
 * 获取所有越秀报备记录（兼容旧代码）
 */
export async function getAllYuexiuReports(): Promise<any[]> {
  return getReportsByType('yuexiu');
}

/**
 * 更新越秀报备状态（兼容旧代码）
 */
export async function updateYuexiuReportStatus(id: number, status: string): Promise<void> {
  return updateReportStatus(id, status);
}

// ==================== 保利端兼容 ====================

/**
 * 插入保利报备记录（兼容旧代码）
 */
export async function insertBaoliReport(data: {
  customerName: string;
  customerGender: string;
  customerPhone: string;
  reportProject: string;
  propertyType?: string;
  reportSubmitTime?: string;
  expectedVisitTime?: string;
  agentName?: string;
  agentRemark?: string;
  fullRecord?: string;
  copyTime?: string;
}): Promise<number> {
  return insertReport(
    {
      customerName: data.customerName,
      customerGender: data.customerGender,
      customerPhone: data.customerPhone,
      reportProject: data.reportProject,
      propertyType: data.propertyType,
      reportSubmitTime: data.reportSubmitTime,
      expectedVisitTime: data.expectedVisitTime,
      agentName: data.agentName,
      agentRemark: data.agentRemark,
    },
    'baoli',
    data.fullRecord,
    data.copyTime
  );
}

/**
 * 获取所有保利报备记录（兼容旧代码）
 */
export async function getAllBaoliReports(): Promise<any[]> {
  return getReportsByType('baoli');
}

/**
 * 更新保利报备状态（兼容旧代码）
 */
export async function updateBaoliReportStatus(id: number, status: string): Promise<void> {
  return updateReportStatus(id, status);
}

// ==================== 导出数据库实例 ====================

export function getDb(): SQLite.SQLiteDatabase | null {
  return db;
}

/**
 * 打印所有报备记录（用于调试）
 */
export async function printAllReports(): Promise<void> {
  if (!db) {
    await initDatabase();
  }
  
  try {
    const reports = await getAllReports();
    
    console.log('========================================');
    console.log('         所有报备记录');
    console.log('========================================');
    console.log(`总计: ${reports.length} 条记录`);
    console.log();
    console.log('| ID | 姓名            | 电话        | 项目    | 类型    | 状态     |');
    console.log('|----|-----------------|-------------|---------|---------|----------|');
    
    for (const r of reports) {
      const name = (r.customer_name || r.customerName || '').padEnd(15, ' ');
      const phone = (r.customer_phone || r.customerPhone || '').padEnd(11, ' ');
      const project = (r.report_project || '').padEnd(7, ' ');
      const type = (r.project_type || '').padEnd(7, ' ');
      const status = (r.status || '').padEnd(8, ' ');
      console.log(`| ${(r.id + '').padEnd(2)} | ${name} | ${phone} | ${project} | ${type} | ${status} |`);
    }
    
    console.log();
    console.log('========================================');
  } catch (error) {
    console.error('[数据库] 打印记录失败:', error);
  }
}
