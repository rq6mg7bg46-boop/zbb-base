/**
 * ZBB 控制台页面
 * 实时显示操作日志和进度
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { StatusBar } from '@/components/StatusBar';
import { useTheme } from '@/hooks/useTheme';
import { automationEngine, LogEntry, StepInfo, FlowPhase } from '@/services/AutomationEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ConsoleScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState<StepInfo | null>(null);
  const [currentPhase, setCurrentPhase] = useState<FlowPhase>('idle');
  const [status, setStatus] = useState<string>('idle');
  
  const scrollViewRef = useRef<ScrollView>(null);
  const autoScrollRef = useRef(true);
  
  // 监听流程事件
  useEffect(() => {
    const unsubStarted = automationEngine.addListener((event) => {
      if (event.type === 'started') {
        setLogs([]);
        setStatus('running');
      }
    });
    
    const unsubLog = automationEngine.addListener((event) => {
      if (event.type === 'log') {
        setLogs(prev => [...prev, event.data]);
        if (autoScrollRef.current) {
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      }
    });
    
    const unsubStep = automationEngine.addListener((event) => {
      if (event.type === 'step_changed') {
        setCurrentStep(event.data.step);
      }
    });
    
    const unsubPhase = automationEngine.addListener((event) => {
      if (event.type === 'phase_changed') {
        setCurrentPhase(event.data.phase);
      }
    });
    
    const unsubCompleted = automationEngine.addListener((event) => {
      if (event.type === 'completed') {
        setStatus('completed');
      }
    });
    
    const unsubStopped = automationEngine.addListener((event) => {
      if (event.type === 'stopped') {
        setStatus('stopped');
      }
    });
    
    return () => {
      unsubStarted();
      unsubLog();
      unsubStep();
      unsubPhase();
      unsubCompleted();
      unsubStopped();
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
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  }, []);
  
  // 获取进度
  const getProgress = useCallback(() => {
    const steps = automationEngine.getSteps();
    const completed = steps.filter(s => s.completed).length;
    return {
      completed,
      total: steps.length,
      percent: Math.round((completed / steps.length) * 100),
    };
  }, []);
  
  const progress = getProgress();
  
  // 暂停/继续
  const handlePauseResume = useCallback(() => {
    if (status === 'running') {
      automationEngine.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      automationEngine.resume();
      setStatus('running');
    }
  }, [status]);
  
  // 停止
  const handleStop = useCallback(() => {
    automationEngine.stop();
    setStatus('stopped');
  }, []);
  
  // 清空日志
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);
  
  // 返回
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);
  
  // 渲染日志条目
  const renderLogItem = useCallback(({ item, index }: { item: LogEntry; index: number }) => (
    <View style={[styles.logItem, index % 2 === 0 && { backgroundColor: theme.backgroundTertiary + '50' }]}>
      <Text style={[styles.logTime, { color: theme.textMuted }]}>
        [{formatTime(item.timestamp)}]
      </Text>
      <FontAwesome6 
        name={getLogIcon(item.level) as any} 
        size={12} 
        color={getLogColor(item.level)} 
        style={styles.logIcon}
      />
      <Text style={[styles.logMessage, { color: theme.textSecondary }]} numberOfLines={2}>
        {item.message}
      </Text>
    </View>
  ), [theme, formatTime, getLogIcon, getLogColor]);
  
  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      {/* 顶部状态栏 */}
      <View style={[styles.header, { 
        backgroundColor: theme.backgroundDefault,
        paddingTop: insets.top + 8,
        borderBottomColor: theme.border,
      }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <ThemedText variant="h4" color={theme.textPrimary}>控制台</ThemedText>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
            {getPhaseName(currentPhase)} • 步骤 {currentStep?.step || 0}/38
          </Text>
        </View>
        <TouchableOpacity onPress={handleClearLogs} style={styles.clearButton}>
          <FontAwesome6 name="trash" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
      
      {/* 进度条 */}
      <View style={[styles.progressSection, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.progressInfo}>
          <Text style={[styles.progressLabel, { color: theme.textMuted }]}>执行进度</Text>
          <Text style={[styles.progressValue, { color: theme.primary }]}>
            {progress.completed}/{progress.total} ({progress.percent}%)
          </Text>
        </View>
        <View style={[styles.progressBarContainer, { backgroundColor: theme.backgroundTertiary }]}>
          <View 
            style={[
              styles.progressBar, 
              { 
                backgroundColor: status === 'completed' ? '#10B981' : theme.primary,
                width: `${progress.percent}%`,
              }
            ]} 
          />
        </View>
        
        {/* 操作按钮 */}
        <View style={styles.actionButtons}>
          {status !== 'idle' && status !== 'completed' && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
                onPress={handlePauseResume}
              >
                <FontAwesome6 
                  name={status === 'running' ? 'pause' : 'play'} 
                  size={16} 
                  color="#fff" 
                />
                <Text style={styles.actionButtonText}>
                  {status === 'running' ? '暂停' : '继续'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.stopButton]}
                onPress={handleStop}
              >
                <FontAwesome6 name="stop" size={16} color="#FF4444" />
                <Text style={[styles.actionButtonText, { color: '#FF4444' }]}>停止</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      
      {/* 当前步骤信息 */}
      {currentStep && (
        <View style={[styles.currentStepCard, { backgroundColor: theme.primary + '15' }]}>
          <View style={styles.currentStepHeader}>
            <FontAwesome6 name="circle-notch" size={16} color={theme.primary} />
            <Text style={[styles.currentStepTitle, { color: theme.primary }]}>
              当前步骤 {currentStep.step}
            </Text>
          </View>
          <Text style={[styles.currentStepName, { color: theme.textPrimary }]}>
            {currentStep.name}
          </Text>
          <Text style={[styles.currentStepDesc, { color: theme.textMuted }]}>
            {currentStep.description}
          </Text>
        </View>
      )}
      
      {/* 日志列表 */}
      <View style={styles.logsSection}>
        <View style={styles.logsHeader}>
          <Text style={[styles.logsTitle, { color: theme.textPrimary }]}>实时日志</Text>
          <Text style={[styles.logsCount, { color: theme.textMuted }]}>
            {logs.length} 条
          </Text>
        </View>
        
        <ScrollView 
          ref={scrollViewRef}
          style={[styles.logsList, { backgroundColor: theme.backgroundDefault }]}
          contentContainerStyle={styles.logsListContent}
        >
          {logs.length === 0 ? (
            <View style={styles.emptyLogs}>
              <FontAwesome6 name="scroll" size={32} color={theme.textMuted} />
              <Text style={[styles.emptyLogsText, { color: theme.textMuted }]}>
                暂无日志，等待开始...
              </Text>
            </View>
          ) : (
            logs.map((log, index) => (
              <View key={index}>
                {renderLogItem({ item: log, index })}
              </View>
            ))
          )}
        </ScrollView>
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
  headerTitle: {
    flex: 1,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  clearButton: {
    padding: 8,
  },
  progressSection: {
    padding: 16,
    marginBottom: 8,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  stopButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  currentStepCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
  },
  currentStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  currentStepTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  currentStepName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  currentStepDesc: {
    fontSize: 13,
  },
  logsSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  logsTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  logsCount: {
    fontSize: 12,
  },
  logsList: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  logsListContent: {
    paddingVertical: 8,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logTime: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginRight: 8,
  },
  logIcon: {
    marginRight: 6,
    marginTop: 2,
  },
  logMessage: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyLogs: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyLogsText: {
    marginTop: 12,
    fontSize: 14,
  },
});
