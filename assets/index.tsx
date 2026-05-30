/**
 * ZBB 日志记录页面
 * 完整操作日志记录
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { automationEngine, LogEntry, FlowPhase } from '@/services/AutomationEngine';

export default function LogsScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogEntry['level'] | 'all'>('all');
  
  // 加载日志
  useEffect(() => {
    // 监听新日志
    const unsubLog = automationEngine.addListener((event) => {
      if (event.type === 'log') {
        setLogs(prev => [...prev, event.data]);
      }
    });
    
    return () => {
      unsubLog();
    };
  }, []);
  
  // 获取阶段名称
  const getPhaseName = useCallback((phase: FlowPhase): string => {
    const names: Record<FlowPhase, string> = {
      idle: '空闲',
      open_wechat: '打开微信',
      search_xiaochengxu: '搜索小程序',
      enter_project: '进入项目详情',
      input_customer_1: '输入客户信息',
      select_project_1: '选择第一个项目',
      read_notice_1: '阅读须知1',
      input_customer_2: '输入客户信息',
      select_project_2: '选择第二个项目',
      read_notice_2: '阅读须知2',
      return_wechat: '返回微信',
      open_douyin: '打开抖音',
      find_message: '获取信息',
      open_douyin_send: '发送截图',
      exit_douyin: '退出抖音',
      completed: '已完成',
      error: '错误',
      paused: '暂停',
      stopped: '已停止',
    };
    return names[phase] || phase;
  }, []);
  
  // 获取日志级别颜色
  const getLogColor = useCallback((level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '#FF4444';
      case 'warn': return '#FFA500';
      case 'success': return '#10B981';
      default: return theme.textSecondary;
    }
  }, [theme]);
  
  // 获取日志级别图标
  const getLogIcon = useCallback((level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'times-circle';
      case 'warn': return 'exclamation-triangle';
      case 'success': return 'check-circle';
      default: return 'info-circle';
    }
  }, []);
  
  // 格式化时间
  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
    return dateStr;
  }, []);
  
  // 导出日志
  const handleExport = useCallback(() => {
    const logText = logs.map(log => {
      return `[${formatTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}`;
    }).join('\n');
    
    Alert.alert(
      '日志导出',
      `共 ${logs.length} 条日志\n\n${logText.substring(0, 500)}...`,
      [{ text: '确定' }]
    );
  }, [logs, formatTime]);
  
  // 清空日志
  const handleClear = useCallback(() => {
    Alert.alert(
      '确认清空',
      '确定要清空所有日志吗？',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '确定', 
          style: 'destructive',
          onPress: () => {
            setLogs([]);
          }
        },
      ]
    );
  }, []);
  
  // 返回
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);
  
  // 过滤日志
  const filteredLogs = filterLevel === 'all' 
    ? logs 
    : logs.filter(log => log.level === filterLevel);
  
  // 统计
  const stats = {
    total: logs.length,
    success: logs.filter(l => l.level === 'success').length,
    error: logs.filter(l => l.level === 'error').length,
    warn: logs.filter(l => l.level === 'warn').length,
  };
  
  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      {/* 顶部导航 */}
      <View style={[styles.header, { 
        backgroundColor: theme.backgroundDefault,
        paddingTop: insets.top + 8,
        borderBottomColor: theme.border,
      }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
        </TouchableOpacity>
        <ThemedText variant="h4" color={theme.textPrimary}>日志记录</ThemedText>
        <TouchableOpacity onPress={handleExport} style={styles.exportButton}>
          <FontAwesome6 name="share" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
      
      {/* 统计卡片 */}
      <View style={[styles.statsCard, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.total}</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>总计</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.success}</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>成功</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#FFA500' }]}>{stats.warn}</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>警告</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#FF4444' }]}>{stats.error}</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>错误</Text>
        </View>
      </View>
      
      {/* 过滤器 */}
      <View style={styles.filterContainer}>
        {(['all', 'info', 'success', 'warn', 'error'] as const).map((level) => (
          <TouchableOpacity
            key={level}
            style={[
              styles.filterButton,
              { 
                backgroundColor: filterLevel === level 
                  ? theme.primary 
                  : theme.backgroundTertiary,
              }
            ]}
            onPress={() => setFilterLevel(level)}
          >
            <Text style={[
              styles.filterButtonText,
              { color: filterLevel === level ? '#fff' : theme.textSecondary }
            ]}>
              {level === 'all' ? '全部' : level === 'info' ? '信息' : level}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* 日志列表 */}
      <ScrollView 
        style={styles.logsList}
        contentContainerStyle={styles.logsListContent}
      >
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyLogs}>
            <FontAwesome6 name="scroll" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyLogsText, { color: theme.textMuted }]}>
              暂无日志记录
            </Text>
          </View>
        ) : (
          filteredLogs.map((log, index) => (
            <View 
              key={index} 
              style={[
                styles.logItem,
                { backgroundColor: theme.backgroundDefault },
                index % 2 === 0 && { backgroundColor: theme.backgroundTertiary + '50' },
              ]}
            >
              <View style={styles.logHeader}>
                <View style={styles.logLevelContainer}>
                  <FontAwesome6 
                    name={getLogIcon(log.level) as any} 
                    size={14} 
                    color={getLogColor(log.level)} 
                  />
                  <Text style={[styles.logLevel, { color: getLogColor(log.level) }]}>
                    {log.level.toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.logTime, { color: theme.textMuted }]}>
                  {formatTime(log.timestamp)}
                </Text>
              </View>
              
              <Text style={[styles.logMessage, { color: theme.textSecondary }]}>
                {log.message}
              </Text>
              
              {log.phase && (
                <View style={[styles.logTag, { backgroundColor: theme.primary + '20' }]}>
                  <Text style={[styles.logTagText, { color: theme.primary }]}>
                    {getPhaseName(log.phase)}
                  </Text>
                </View>
              )}
              
              {log.step && (
                <Text style={[styles.logStep, { color: theme.textMuted }]}>
                  步骤 {log.step}
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
      
      {/* 底部操作栏 */}
      <View style={[styles.bottomBar, { 
        backgroundColor: theme.backgroundDefault,
        paddingBottom: insets.bottom + 8,
        borderTopColor: theme.border,
      }]}>
        <TouchableOpacity 
          style={[styles.clearButton, { borderColor: '#FF4444' }]}
          onPress={handleClear}
        >
          <FontAwesome6 name="trash" size={16} color="#FF4444" />
          <Text style={[styles.clearButtonText, { color: '#FF4444' }]}>清空日志</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  exportButton: {
    padding: 8,
    marginLeft: 'auto',
  },
  statsCard: {
    flexDirection: 'row',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: '100%',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  logsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  logsListContent: {
    paddingBottom: 16,
  },
  logItem: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logLevelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logLevel: {
    fontSize: 11,
    fontWeight: '700',
  },
  logTime: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  logMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  logTag: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  logTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  logStep: {
    fontSize: 11,
    marginTop: 4,
  },
  emptyLogs: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyLogsText: {
    marginTop: 16,
    fontSize: 16,
  },
  bottomBar: {
    padding: 12,
    borderTopWidth: 1,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
