/**
 * ZBB 首页 - 自动化控制中心
 * 版本: v5.0
 * 
 * 功能：
 * - 无障碍服务状态检测
 * - 启动/停止自动化流程
 * - 实时步骤状态显示
 * - 客户信息展示
 * 
 * 注意：实际屏幕显示由 Android 原生悬浮窗负责
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { logToBoth } from '@/services/AutomationLogger';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { zbbAutomation } from '@/native';
import { nativeAutomationService, baoliService } from '@/services';
import { qianjiService } from '@/services/QianjiService';
import { printAllReports, exportToCSV, exportToJSON, getTodayBaoliReportCount, initDatabase } from '@/services/DatabaseService';

// 流程步骤定义
const FLOW_STEPS = [
  { id: 'open_douyin', name: '打开抖音', app: 'douyin' },
  { id: 'click_messages', name: '点击消息', app: 'douyin' },
  { id: 'find_friend', name: '查找好友', app: 'douyin' },
  { id: 'click_chat', name: '进入聊天', app: 'douyin' },
  { id: 'long_press', name: '长按消息', app: 'douyin' },
  { id: 'copy_message', name: '复制信息', app: 'douyin' },
  { id: 'open_wechat', name: '打开企业微信', app: 'wechat' },
  { id: 'workbench', name: '点击工作台', app: 'wechat' },
  { id: 'mini_app', name: '点击新绿城云', app: 'wechat' },
  { id: 'report_1', name: '报备项目1', app: 'wechat' },
  { id: 'report_2', name: '报备项目2', app: 'wechat' },
  { id: 'return_douyin', name: '返回抖音', app: 'douyin' },
  { id: 'send_screenshots', name: '发送截图', app: 'douyin' },
  { id: 'complete', name: '流程完成', app: '' },
];

// APP配置
const APP_CONFIG: Record<string, { name: string; color: string; bgColor: string }> = {
  douyin: { name: '抖音', color: '#FFFFFF', bgColor: '#000000' },
  wechat: { name: '企业微信', color: '#FFFFFF', bgColor: '#07C160' },
  qianji: { name: '千机', color: '#FFFFFF', bgColor: '#8B5CF6' },
  '': { name: '完成', color: '#FFFFFF', bgColor: '#10B981' },
};

export default function HomeScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  
  // 状态
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'enabled' | 'disabled'>('checking');
  const [projectionStatus, setProjectionStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('空闲');
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [currentApp, setCurrentApp] = useState<string>('');
  const [todayCount, setTodayCount] = useState(0);
  const [customerInfo, setCustomerInfo] = useState<{ name: string; phone: string } | null>(null);
  const [clipboardText, setClipboardText] = useState('');
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);
  const [pendingAutoStart, setPendingAutoStart] = useState(false);
  
  // 检查无障碍服务状态
  const checkAccessibility = useCallback(async () => {
    try {
      setServiceStatus('checking');
      const isRunning = await zbbAutomation.isServiceRunning();
      setServiceStatus(isRunning ? 'enabled' : 'disabled');
    } catch (error) {
      console.error('检查无障碍服务失败:', error);
      setServiceStatus('disabled');
    }
  }, []);
  
  // 检查 MediaProjection 权限状态
  const checkMediaProjection = useCallback(async () => {
    try {
      setProjectionStatus('checking');
      // 尝试请求权限来检查状态
      const granted = await zbbAutomation.requestMediaProjectionPermission();
      setProjectionStatus(granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      console.error('检查 MediaProjection 权限失败:', error);
      setProjectionStatus('denied');
      return false;
    }
  }, []);
  
  useEffect(() => {
    // 首次加载时初始化数据库（创建表），完成后加载今日报备数
    initDatabase()
      .then(() => getTodayBaoliReportCount())
      .then(count => setTodayCount(count))
      .catch(err => console.error('数据库初始化失败:', err));
    checkAccessibility();
  }, [checkAccessibility]);
  
  // 页面聚焦时刷新今日报备数
  useFocusEffect(
    useCallback(() => {
      getTodayBaoliReportCount()
        .then(count => setTodayCount(count))
        .catch(err => console.error('加载今日报备数失败:', err));
    }, [])
  );
  
  // ====== 自动检测粘贴 → 解析 → 写库 → 启动报备 ======
  // 当 pendingAutoStart=true 且 clipboardText 有内容时，触发自动流程
  useEffect(() => {
    if (!pendingAutoStart || !clipboardText.trim() || isAutoProcessing) return;
    
    const processClipboard = async () => {
      setIsAutoProcessing(true);
      logToBoth('info', '[ZBB] 检测到粘贴内容，开始自动解析...');
      
      try {
        // 解析客户信息（使用与 QianjiService 相同的解析逻辑）
        const lines = clipboardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const result: any = {
          projectType: 'baoli',
          customerName: '',
          phone: '',
          agent: '',
          reportTime: '',
          expectedVisitTime: '',
        };
        
        for (const line of lines) {
          if (line.includes('客户姓名：') || line.includes('客户姓名:')) {
            result.customerName = line.split(/[：:]/)[1]?.trim() || '';
          } else if (line.includes('客户联系方式：') || line.includes('客户联系方式:')) {
            result.phone = line.split(/[：:]/)[1]?.trim().replace(/\*/g, '') || '';
          } else if (line.includes('报备项目：') || line.includes('报备项目:')) {
            const project = line.split(/[：:]/)[1]?.trim() || '';
            result.projectType = project.includes('越秀') ? 'yuexiu' : 'baoli';
          } else if (line.includes('经纪人姓名：') || line.includes('经纪人姓名:')) {
            result.agent = line.split(/[：:]/)[1]?.trim() || '';
          } else if (line.includes('报备提交时间：') || line.includes('报备提交时间:')) {
            result.reportTime = line.split(/[：:]/)[1]?.trim() || '';
          } else if (line.includes('预计到访时间：') || line.includes('预计到访时间:')) {
            result.expectedVisitTime = line.split(/[：:]/)[1]?.trim() || '';
          } else if (line.includes('保利')) {
            result.projectType = 'baoli';
          } else if (line.includes('越秀')) {
            result.projectType = 'yuexiu';
          } else if (/^1[3-9]\d{9}$/.test(line.replace(/\s/g, '').replace(/\*/g, ''))) {
            result.phone = line.replace(/\s/g, '').replace(/\*/g, '');
          }
        }
        
        // 判断性别
        const customerName = result.customerName || '';
        let customerGender = '';
        if (customerName.includes('女士') || customerName.includes('小姐') || customerName.includes('太太')) {
          customerGender = '女';
        } else if (customerName.includes('先生')) {
          customerGender = '男';
        }
        
        // 预计到访时间
        let expectedVisitTime = '';
        if (result.reportTime) {
          const reportDate = new Date(result.reportTime);
          reportDate.setHours(reportDate.getHours() + 24);
          expectedVisitTime = reportDate.toISOString().replace('T', ' ').substring(0, 19);
        }
        
        logToBoth('info', `[ZBB] 解析结果: ${JSON.stringify(result)}`);

        // 只检测电话号码（脱敏格式如 177****7907 或 *******9923），其他字段已由千机端写入数据库
        const phoneRegex = /^1[3-9]\d{2}\*+\d{4}$/;
        if (!result.phone || !phoneRegex.test(result.phone)) {
          logToBoth('warn', `[ZBB] 剪贴板中未检测到有效电话号码，当前值: ${result.phone}`);
          Alert.alert('解析失败', '无法从剪贴板中获取有效的电话号码，请确认是否已正确复制。');
          setIsAutoProcessing(false);
          return;
        }
        
        // 写入数据库
        const reportProject = result.projectType === 'yuexiu' ? '越秀' : '保利';
        const { insertReport } = await import('@/services/DatabaseService');
        const reportId = await insertReport(
          {
            customerName: customerName,
            customerGender: customerGender,
            customerPhone: result.phone,
            reportProject: reportProject,
            reportSubmitTime: result.reportTime,
            expectedVisitTime: expectedVisitTime,
            agentName: result.agent,
            agentRemark: '',
          },
          'qianji',  // 来源为千机端
          JSON.stringify(result),
          result.reportTime || ''
        );
        
        logToBoth('success', `[ZBB] 已写入数据库，记录ID: ${reportId}`);
        setTodayCount(prev => prev + 1);
        setCustomerInfo({ name: result.customerName, phone: result.phone });
        
        // 清空输入框
        setClipboardText('');
        setPendingAutoStart(false);
        
        // 自动启动报备流程
        if (result.projectType === 'baoli') {
          logToBoth('info', '[ZBB] 自动启动保利端...');
          setCurrentStep('自动启动保利端');
          setCurrentApp('baoli');
          await baoliService.execute();
          setCurrentStep('流程完成');
          Alert.alert('流程完成', `客户 ${result.customerName} 已报备成功！`);
        } else if (result.projectType === 'yuexiu') {
          logToBoth('warn', '[ZBB] 越秀端尚未实现');
          Alert.alert('越秀端', '越秀端尚未实现，请手动处理。');
        }
        
      } catch (error) {
        logToBoth('error', `[ZBB] 自动处理失败: ${error}`);
        Alert.alert('处理失败', String(error));
      } finally {
        setIsAutoProcessing(false);
      }
    };
    
    processClipboard();
  }, [pendingAutoStart, clipboardText, isAutoProcessing]);
  
  // 步骤更新回调
  const handleStepUpdate = useCallback((stepName: string, stepIndex: number) => {
    setCurrentStep(stepName);
    setCurrentStepIndex(stepIndex);
    if (stepIndex >= 0 && stepIndex < FLOW_STEPS.length) {
      setCurrentApp(FLOW_STEPS[stepIndex].app);
    }
  }, []);
  
  // 启动流程
  const handleStart = useCallback(async () => {
    // 1. 检查无障碍服务
    if (serviceStatus !== 'enabled') {
      Alert.alert(
        '请开启无障碍服务',
        'ZBB 需要无障碍服务权限才能运行自动化流程。',
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '去设置', 
            onPress: async () => {
              try {
                await zbbAutomation.openAccessibilitySettings();
              } catch (error) {
                console.error('打开设置失败:', error);
              }
            }
          },
        ]
      );
      return;
    }
    
    // 2. 检查 MediaProjection 权限
    const hasProjection = await checkMediaProjection();
    if (!hasProjection) {
      Alert.alert(
        '请授予屏幕截图权限',
        'ZBB 需要屏幕截图权限（MediaProjection）才能进行 OCR 识别。',
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '授予权限', 
            onPress: async () => {
              // 用户需要手动授权
              const granted = await checkMediaProjection();
              if (!granted) {
                Alert.alert('权限被拒绝', '您已拒绝屏幕截图权限，OCR 功能将无法使用。');
              }
            }
          },
        ]
      );
      return;
    }
    
    // 3. 直接启动完整流程
    try {
      setIsRunning(true);
      setCurrentStepIndex(-1);
      setCurrentStep('正在启动...');
      
      // 注册步骤更新回调
      nativeAutomationService.onStepUpdate(handleStepUpdate);
      
      // 执行完整流程
      const result = await nativeAutomationService.executeFullFlow();
      
      if (result.success) {
        setTodayCount(prev => prev + 1);
        if (result.customerInfo) {
          setCustomerInfo({
            name: result.customerInfo.name,
            phone: result.customerInfo.phone,
          });
        }
        setCurrentStepIndex(FLOW_STEPS.length - 1);
        setCurrentStep('流程完成');
        setCurrentApp('');
        
        Alert.alert(
          '流程完成',
          `已完成报备流程\n姓名: ${result.customerInfo?.name || '未知'}\n电话: ${result.customerInfo?.phone || '未知'}\n截图: ${result.screenshots.length} 张`,
          [{ text: '确定' }]
        );
      } else {
        setCurrentApp('');
        Alert.alert('流程失败', '请查看日志了解详情', [
          { text: '查看日志', onPress: () => router.push('/console') },
          { text: '确定' },
        ]);
      }
    } catch (error) {
      Alert.alert('执行出错', String(error));
    } finally {
      setIsRunning(false);
      setCurrentStep('空闲');
      setCurrentApp('');
      nativeAutomationService.offStepUpdate(handleStepUpdate);
    }
  }, [serviceStatus, handleStepUpdate, router]);

  // 测试越秀端企业微信流程
  const handleTestYuexiu = useCallback(async () => {
    // 检查无障碍服务
    if (serviceStatus !== 'enabled') {
      Alert.alert(
        '请开启无障碍服务',
        'ZBB 需要无障碍服务权限才能运行自动化流程。',
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '去设置', 
            onPress: async () => {
              try {
                await zbbAutomation.openAccessibilitySettings();
              } catch (error) {
                console.error('打开设置失败:', error);
              }
            }
          },
        ]
      );
      return;
    }
    
    try {
      setIsRunning(true);
      setCurrentStep('越秀端测试...');
      setCurrentApp('wechat');
      
      const result = await nativeAutomationService.testWechatOnly();
      
      if (result.success) {
        setCurrentStep('测试完成');
        Alert.alert('测试成功', '越秀端企业微信流程测试通过！');
      } else {
        setCurrentStep('测试失败');
        Alert.alert('测试失败', result.error || '请查看日志', [
          { text: '查看日志', onPress: () => router.push('/console') },
          { text: '确定' },
        ]);
      }
    } catch (error) {
      Alert.alert('执行出错', String(error));
    } finally {
      setIsRunning(false);
      setCurrentStep('空闲');
      setCurrentApp('');
    }
  }, [serviceStatus, router]);

  // 测试保利端流程（独立服务）
  const handleTestBaoli = useCallback(async () => {
    if (serviceStatus !== 'enabled') {
      Alert.alert(
        '请开启无障碍服务',
        'ZBB 需要无障碍服务权限才能运行自动化流程。',
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '去设置', 
            onPress: async () => {
              try {
                await zbbAutomation.openAccessibilitySettings();
              } catch (error) {
                console.error('打开设置失败:', error);
              }
            }
          },
        ]
      );
      return;
    }
    
    try {
      setIsRunning(true);
      setCurrentStep('保利端测试...');
      setCurrentApp('wechat');
      
      const result = await baoliService.execute();
      
      if (result.success) {
        setCurrentStep('测试完成');
        Alert.alert('测试成功', '保利端独立服务测试通过！');
      } else {
        setCurrentStep('测试失败');
        Alert.alert('测试失败', result.error || '请查看日志', [
          { text: '查看日志', onPress: () => router.push('/console') },
          { text: '确定' },
        ]);
      }
    } catch (error) {
      Alert.alert('执行出错', String(error));
    } finally {
      setIsRunning(false);
      setCurrentStep('空闲');
      setCurrentApp('');
    }
  }, [serviceStatus, router]);

  // 测试千机端流程
  const handleTestQianji = useCallback(async () => {
    if (serviceStatus !== 'enabled') {
      Alert.alert(
        '请开启无障碍服务',
        'ZBB 需要无障碍服务权限才能运行自动化流程。',
        [
          { text: '取消', style: 'cancel' },
          { 
            text: '去设置', 
            onPress: async () => {
              try {
                await zbbAutomation.openAccessibilitySettings();
              } catch (error) {
                console.error('打开设置失败:', error);
              }
            }
          },
        ]
      );
      return;
    }
    
    try {
      setIsRunning(true);
      setCurrentStep('千机端测试...');
      setCurrentApp('qianji');
      
      // 步骤1：打开千机
      await qianjiService.stepOpenQianji();
      
      // 步骤2：识别界面
      await qianjiService.stepRecognizeInterface();
      
      // 步骤3：查找报备审核并收集客户信息（点击复制后数据已在剪贴板）
      await qianjiService.stepFindAndCollectCustomer();
      
      // 步骤4：按 Home 返回 ZBB（由用户在 ZBB 的 TextInput 中粘贴读取剪贴板内容）
      await qianjiService.stepReturnToZBB();
      
      // 千机端流程已完成，设置待粘贴标志，用户粘贴后会自动解析、写库、启动报备
      setPendingAutoStart(true);
      setIsRunning(false);  // 自动化部分已完成，等待用户粘贴
      setCurrentStep('千机端完成，请在 ZBB 中粘贴客户信息');
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[测试] 捕获到错误:', errorMsg);
      setCurrentStep('测试失败');
      Alert.alert('测试失败', errorMsg, [
        { text: '查看日志', onPress: () => router.push('/console') },
        { text: '确定' },
      ]);
    } finally {
      setIsRunning(false);
      // 只有在非千机端返回成功的情况下才重置为"空闲"，避免覆盖成功状态
      if (!pendingAutoStart) {
        setCurrentStep('空闲');
      }
      setCurrentApp('');
    }
  }, [serviceStatus, router, baoliService, qianjiService]);

  // 停止流程
  const handleStop = useCallback(() => {
    if (isRunning) {
      nativeAutomationService.stop();
      setIsRunning(false);
      setCurrentStep('已停止');
      setCurrentApp('');
      Alert.alert('已停止', 'ZBB 自动化流程已停止');
    } else {
      Alert.alert('提示', 'ZBB 当前未在运行');
    }
  }, [isRunning]);
  
  // 打开控制台
  const handleOpenConsole = useCallback(() => {
    router.push('/console');
  }, [router]);
  
  // 获取服务状态
  const getServiceStatusText = () => {
    switch (serviceStatus) {
      case 'checking': return '检查中...';
      case 'enabled': return '已开启';
      case 'disabled': return '未开启';
    }
  };
  
  const getServiceStatusColor = () => {
    switch (serviceStatus) {
      case 'checking': return theme.textMuted;
      case 'enabled': return '#10B981';
      case 'disabled': return '#FF4444';
    }
  };

  return (
    <Screen 
      backgroundColor={theme.backgroundRoot} 
      statusBarStyle={isDark ? 'light' : 'dark'}
    >
      <ScrollView 
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
      >
        {/* 标题区域 */}
        <View style={styles.header}>
          <View>
            <ThemedText variant="h1" color={theme.textPrimary} style={styles.title}>
              ZBB
            </ThemedText>
            <ThemedText variant="caption" color={theme.textMuted}>
              自动化报备工具
            </ThemedText>
          </View>
          <View style={styles.statusContainer}>
            {/* 无障碍服务状态 */}
            <TouchableOpacity 
              style={[styles.statusBadge, { backgroundColor: getServiceStatusColor() + '20' }]}
              onPress={checkAccessibility}
            >
              <View style={[styles.statusDot, { backgroundColor: getServiceStatusColor() }]} />
              <Text style={[styles.statusText, { color: getServiceStatusColor() }]}>
                无障碍 {getServiceStatusText()}
              </Text>
            </TouchableOpacity>
            {/* MediaProjection 权限状态 */}
            <TouchableOpacity 
              style={[
                styles.statusBadge, 
                { 
                  backgroundColor: (projectionStatus === 'granted' ? '#10B981' : '#FF4444') + '20',
                  marginTop: 4 
                }
              ]}
              onPress={checkMediaProjection}
            >
              <View style={[styles.statusDot, { backgroundColor: projectionStatus === 'granted' ? '#10B981' : '#FF4444' }]} />
              <Text style={[styles.statusText, { color: projectionStatus === 'granted' ? '#10B981' : '#FF4444' }]}>
                截图 {projectionStatus === 'granted' ? '已授权' : projectionStatus === 'denied' ? '未授权' : '检查中...'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 运行状态卡片 */}
        {isRunning && (
          <View style={[styles.executionCard, { backgroundColor: theme.backgroundDefault }]}>
            {/* APP图标 */}
            <View style={styles.appContainer}>
              <View style={[styles.appIcon, { backgroundColor: APP_CONFIG[currentApp]?.bgColor || '#666' }]}>
                <FontAwesome6 
                  name={currentApp === 'douyin' ? 'play' : currentApp === 'wechat' ? 'weixin' : currentApp === 'qianji' ? 'home' : 'check'} 
                  size={32} 
                  color={APP_CONFIG[currentApp]?.color || '#fff'} 
                />
              </View>
              <Text style={[styles.appName, { color: APP_CONFIG[currentApp]?.bgColor || theme.primary }]}>
                {APP_CONFIG[currentApp]?.name || '准备中'}
              </Text>
            </View>
            
            {/* 步骤显示 */}
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>当前步骤</Text>
              <Text style={[styles.stepName, { color: theme.textPrimary }]}>
                {currentStep}
              </Text>
            </View>
            
            {/* 进度条 */}
            <View style={styles.progressBarContainer}>
              <View 
                style={[
                  styles.progressBar, 
                  { 
                    backgroundColor: theme.primary,
                    width: `${Math.max(5, Math.min(100, ((currentStepIndex + 1) / FLOW_STEPS.length) * 100))}%` 
                  }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: theme.textMuted }]}>
              {currentStepIndex + 1} / {FLOW_STEPS.length}
            </Text>
          </View>
        )}
        
        {/* 空闲提示 / 粘贴 TextInput */}
        {!isRunning && (
          <>
            {/* 待粘贴状态：显示 TextInput */}
            {pendingAutoStart ? (
              <View style={[styles.pasteCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.primary + '40' }]}>
                <View style={styles.pasteHeader}>
                  <FontAwesome6 name="clipboard" size={20} color={theme.primary} />
                  <Text style={[styles.pasteTitle, { color: theme.primary }]}>请粘贴客户信息</Text>
                </View>
                <Text style={[styles.pasteHint, { color: theme.textMuted }]}>
                  长按下方输入框 → 选择「粘贴」→ 系统自动解析并报备
                </Text>
                <TextInput
                  style={[
                    styles.pasteInput,
                    {
                      backgroundColor: isAutoProcessing ? theme.backgroundRoot : '#fff',
                      color: theme.textPrimary,
                      borderColor: theme.primary,
                    }
                  ]}
                  placeholder={isAutoProcessing ? '正在自动处理...' : '长按此处粘贴客户信息'}
                  placeholderTextColor={theme.textMuted}
                  value={clipboardText}
                  onChangeText={setClipboardText}
                  multiline
                  editable={!isAutoProcessing}
                />
                {isAutoProcessing && (
                  <View style={styles.processingIndicator}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={[styles.processingText, { color: theme.textMuted }]}>正在自动解析并写入数据库...</Text>
                  </View>
                )}
              </View>
            ) : (
              /* 正常空闲状态 */
              <View style={[styles.idleCard, { backgroundColor: theme.backgroundDefault }]}>
                <FontAwesome6 name="hand-point-right" size={24} color={theme.primary} />
                <Text style={[styles.idleText, { color: theme.textSecondary }]}>
                  点击下方「启动 ZBB 流程」开始自动化报备
                </Text>
              </View>
            )}
          </>
        )}
        
        {/* 统计卡片 */}
        <View style={[styles.statsContainer, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.statItem}>
            <FontAwesome6 name="check-circle" size={28} color="#10B981" />
            <ThemedText variant="h2" color={theme.primary} style={styles.statNumber}>
              {todayCount}
            </ThemedText>
            <ThemedText variant="caption" color={theme.textSecondary}>
              今日完成
            </ThemedText>
          </View>
          
          <View style={[styles.statDivider, { backgroundColor: theme.borderColor }]} />
          
          <View style={styles.statItem}>
            <FontAwesome6 
              name={isRunning ? 'circle-notch' : 'clock'} 
              size={28} 
              color={isRunning ? theme.primary : theme.textMuted}
            />
            <ThemedText variant="body" color={theme.textPrimary} style={styles.statStatus}>
              {currentStep}
            </ThemedText>
            <ThemedText variant="caption" color={theme.textSecondary}>
              当前状态
            </ThemedText>
          </View>
        </View>
        
        {/* 客户信息卡片 */}
        {customerInfo && (
          <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.infoHeader}>
              <FontAwesome6 name="user" size={20} color={theme.primary} />
              <ThemedText variant="body" color={theme.textPrimary} style={styles.infoTitle}>
                本次客户信息
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText variant="caption" color={theme.textSecondary}>姓名</ThemedText>
              <ThemedText variant="body" color={theme.textPrimary}>{customerInfo.name}</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText variant="caption" color={theme.textSecondary}>电话</ThemedText>
              <ThemedText variant="body" color={theme.textPrimary}>{customerInfo.phone}</ThemedText>
            </View>
          </View>
        )}
        
        {/* 按钮区域 */}
        <View style={styles.buttonsContainer}>
          {/* 主启动按钮 */}
          <TouchableOpacity
            style={[
              styles.mainButton, 
              { backgroundColor: isRunning ? theme.textMuted : theme.primary }
            ]}
            onPress={isRunning ? handleStop : handleStart}
            disabled={false}
            activeOpacity={0.8}
          >
            {isRunning ? (
              <>
                <FontAwesome6 name="stop" size={24} color="#fff" />
                <Text style={styles.mainButtonText}>停止 ZBB</Text>
              </>
            ) : (
              <>
                <FontAwesome6 name="play" size={24} color="#fff" />
                <Text style={styles.mainButtonText}>启动 ZBB 流程</Text>
              </>
            )}
          </TouchableOpacity>
          
          {/* 测试越秀端按钮 */}
          <TouchableOpacity
            style={[styles.consoleButton, { backgroundColor: '#10B98120', marginTop: 12 }]}
            onPress={handleTestYuexiu}
            activeOpacity={0.8}
          >
            <FontAwesome6 name="city" size={20} color="#10B981" />
            <Text style={[styles.consoleButtonText, { color: '#10B981' }]}>
              测试越秀端
            </Text>
            <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
          </TouchableOpacity>
          
          {/* 测试保利端按钮 */}
          <TouchableOpacity
            style={[styles.consoleButton, { backgroundColor: '#F59E0B20', marginTop: 12 }]}
            onPress={handleTestBaoli}
            activeOpacity={0.8}
          >
            <FontAwesome6 name="building" size={20} color="#F59E0B" />
            <Text style={[styles.consoleButtonText, { color: '#F59E0B' }]}>
              测试保利端
            </Text>
            <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
          </TouchableOpacity>
          
          {/* 测试千机端按钮 */}
          <TouchableOpacity
            style={[styles.consoleButton, { backgroundColor: '#8B5CF620', marginTop: 12 }]}
            onPress={handleTestQianji}
            activeOpacity={0.8}
          >
            <FontAwesome6 name="home" size={20} color="#8B5CF6" />
            <Text style={[styles.consoleButtonText, { color: '#8B5CF6' }]}>
              测试千机端
            </Text>
            <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
          </TouchableOpacity>
          
          {/* 控制台按钮 */}
          <TouchableOpacity
            style={[styles.consoleButton, { backgroundColor: theme.backgroundDefault, marginTop: 12 }]}
            onPress={handleOpenConsole}
            activeOpacity={0.8}
          >
            <FontAwesome6 name="terminal" size={20} color={theme.primary} />
            <Text style={[styles.consoleButtonText, { color: theme.textPrimary }]}>
              查看控制台
            </Text>
            <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
        
        {/* 流程说明 */}
        <View style={styles.flowInfo}>
          <ThemedText variant="caption" color={theme.textMuted} style={styles.flowTitle}>
            自动化流程说明
          </ThemedText>
          <View style={styles.flowSteps}>
            <View style={styles.flowStep}>
              <View style={[styles.stepNumber, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>1</Text>
              </View>
              <ThemedText variant="caption" color={theme.textSecondary}>
                抖音获取客户信息
              </ThemedText>
            </View>
            <FontAwesome6 name="arrow-right" size={12} color={theme.textMuted} />
            <View style={styles.flowStep}>
              <View style={[styles.stepNumber, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>2</Text>
              </View>
              <ThemedText variant="caption" color={theme.textSecondary}>
                微信小程序报备
              </ThemedText>
            </View>
            <FontAwesome6 name="arrow-right" size={12} color={theme.textMuted} />
            <View style={styles.flowStep}>
              <View style={[styles.stepNumber, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>3</Text>
              </View>
              <ThemedText variant="caption" color={theme.textSecondary}>
                发送截图到抖音
              </ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  
  // 运行状态卡片
  executionCard: {
    marginHorizontal: 20,
    padding: 24,
    borderRadius: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  appContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
  },
  stepContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  stepLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  stepName: {
    fontSize: 28,
    fontWeight: '600',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
  },
  
  // 空闲提示
  idleCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  idleText: {
    fontSize: 14,
    flex: 1,
  },
  
  // 粘贴卡片
  pasteCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  pasteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pasteTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  pasteHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  pasteInput: {
    minHeight: 100,
    maxHeight: 200,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  processingText: {
    fontSize: 12,
  },
  
  // 统计卡片
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    marginHorizontal: 16,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: '700',
    marginTop: 8,
  },
  statStatus: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  
  // 客户信息卡片
  infoCard: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  infoTitle: {
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  
  // 按钮
  buttonsContainer: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  consoleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
  },
  consoleButtonText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  
  // 流程说明
  flowInfo: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  flowTitle: {
    marginBottom: 12,
  },
  flowSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  flowStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
