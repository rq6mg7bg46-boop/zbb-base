/**
 * ZBB 数据库服务（精简版）
 * 报备记录管理 — 2026-06-25 瘦身
 *
 * 历史：v1.7.0 之前 DatabaseService 同时管理 baoli + yuexiu + 老链路 CRUD。
 *       瘦身后只保留核心 2 个函数：
 *       - initDatabase() — 初始化 reports 表（首次调用自动触发，由 insertReport 内部保证）
 *       - insertReport() — 千机完成时由 UI 层 (home/index.tsx L385) 调用，写一条报备记录
 *
 * 删除的死代码（git revert 可恢复）：
 *   getAllReports / getReportsByType / getLatestReport / getLatestReportByType
 *   updateReportStatus / deleteReport
 *   getTodayReportCount / getTodayBaoliReportCount / getTodayYuexiuReportCount / getReportStats
 *   insertYuexiuReport / getAllYuexiuReports / updateYuexiuReportStatus  (越秀端已废)
 *   insertBaoliReport / getAllBaoliReports / updateBaoliReportStatus  (兼容层已废)
 *   getDb / printAllReports / updateReportSuccess / updateReportFailed
 *   exportToCSV / exportToJSON
 *
 * 表名：reports
 * project_type: 'baoli' | 'yuexiu'
 */
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'zbb_reports.db';
let db: SQLite.SQLiteDatabase | null = null;

/**
 * 初始化数据库
 * 字段升级逻辑保留（兼容老用户已存在的 DB 文件）
 */
export async function initDatabase(): Promise<void> {
  try {
    console.log('[ZBB DB] 开始初始化数据库...');
    console.log('[ZBB DB] expo-sqlite 版本:', SQLite.openDatabaseAsync ? 'v16+ (async)' : '旧版');

    try {
      db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      console.log('[ZBB DB] openDatabaseAsync 成功');
    } catch (openError: any) {
      console.error('[ZBB DB] openDatabaseAsync 失败:', openError.message);
      // 尝试使用同步方式（旧版兼容）
      if (typeof SQLite.openDatabase === 'function') {
        console.log('[ZBB DB] 回退到 openDatabase...');
        db = SQLite.openDatabase(DATABASE_NAME) as any;
      } else {
        throw openError;
      }
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

      // 字段升级（保留 2026-06-25 之前的字段定义，含越秀端兼容字段，未来可继续删）
      const fieldUpgrades: Array<{name: string; sql: string}> = [
        { name: 'project_type', sql: "ALTER TABLE reports ADD COLUMN project_type TEXT NOT NULL DEFAULT 'baoli'" },
        { name: 'full_record', sql: "ALTER TABLE reports ADD COLUMN full_record TEXT" },
        { name: 'copy_time', sql: "ALTER TABLE reports ADD COLUMN copy_time TEXT NOT NULL DEFAULT ''" },
        { name: 'company_name', sql: "ALTER TABLE reports ADD COLUMN company_name TEXT DEFAULT '贝壳'" },
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

    // 删除老的兼容表（越秀/保利拆分表的残留）
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

/**
 * 插入报备记录
 * 第一次调用时会自动 initDatabase()
 *
 * @param data 报备数据
 * @param projectType 项目类型: 'baoli' | 'yuexiu'
 * @param fullRecord 完整原始文本（可选）
 * @param copyTime 复制时间（可选，默认当前时间）
 * @returns 插入记录的 ID
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
  // 自动初始化（首次调用时）
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
        createdAt,
      ]
    );

    console.log(`[数据库] 插入记录: ${data.customerName} (${data.customerGender}) @ ${data.reportProject} [${projectType}], ID=${result.lastInsertRowId}`);

    return result.lastInsertRowId;
  } catch (error) {
    console.error('[数据库] 插入记录失败:', error);
    throw error;
  }
}