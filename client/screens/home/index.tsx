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

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  AppState,
  DeviceEventEmitter,   // 2026-06-20 补：f83e54b 加了 .addListener('zbbReportCompleted') 但漏 import 导致 ReferenceError
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { QianjiActionCountdown } from '@/components/QianjiActionCountdown';
import { useTheme } from '@/hooks/useTheme';
import { useCooldown } from '@/hooks/useCooldown';
import { zbbAutomation } from '@/native';
import { nativeAutomationService, baoliService } from '@/services';
import { qianjiService } from '@/services/QianjiService';
import { printAllReports, getTodayBaoliReportCount, initDatabase } from '@/services/DatabaseService';

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

// ================== 空闲态情绪话术库 ==================
// 设计原则：1) 权限缺失优先 2) 时段 + 业务数据 3) 随机抽避免重复
// 文本中的 {todayCount} / {missing} 占位符由渲染层高亮加粗
type IdleMsg = { icon: string; text: string };

const IDLE_MESSAGES: Record<string, IdleMsg[]> = {
  // 凌晨/清晨 0-8
  dawn: [
    { icon: 'battery-quarter', text: '小主还没睡呀…我也快没电了，能让我歇会儿吗？' },
    { icon: 'coffee', text: '小主起这么早呀，要不要先泡杯咖啡？' },
    { icon: 'mug-hot', text: '早安小主~ 今天也要元气满满哦！' },
    { icon: 'face-sad-tear', text: '这个点还在忙吗？注意身体呀小主~' },
  ],
  // 上午 9-11
  morning: [
    { icon: 'sun', text: '上午好，小主，今天见到你真开心~' },
    { icon: 'face-smile-beam', text: '小主早！新的一天，准备好搬砖了吗？' },
    { icon: 'briefcase', text: '上班路上小心点哦，客户都在等着呢~' },
    { icon: 'hand-fist', text: '开工大吉，今天的报备肯定顺利！' },
  ],
  // 下午 12-18（业务高峰）
  afternoon: [
    { icon: 'mug-hot', text: '下午好，小主，要不要来杯下午茶？' },
    { icon: 'utensils', text: '小主，午饭吃了吗？别饿着肚子搬砖呀~' },
    { icon: 'face-smile-wink', text: '小主辛苦啦，休息一下眼睛吧~' },
    { icon: 'dumbbell', text: '下午高峰来了！小主加油，今天一定能冲业绩！' },
    { icon: 'cloud-sun', text: '下午时段客户多吗？小主需要帮忙随时叫我~' },
  ],
  // 傍晚 18-20（收工阶段）
  evening: [
    { icon: 'sunset', text: '傍晚啦，小主今天战绩如何？' },
    { icon: 'face-tired', text: '快收工了，小主也累了吧？时间到就下班了~' },
    { icon: 'store', text: '18 点了，客户都准备下班，小主今天还要加单吗？' },
    { icon: 'cloud-moon', text: '天快黑了，小主还要坚持一会吗？' },
  ],
  // 晚上 21-23（前 2 条有任务，后 2 条无任务）
  night: [
    { icon: 'face-tired', text: '小主，我今天转了 {todayCount} 组客户，快累死了。让我歇歇呗~' },
    { icon: 'moon', text: '今天帮小主搞定了 {todayCount} 单，眼睛都花了~' },
    { icon: 'face-kiss', text: '夜深了，小主也要早点睡哦~' },
    { icon: 'bell-slash', text: '都 22 点了，小主也该收工了吧？' },
  ],
};

const PERMISSION_MESSAGES = {
  // 缺两个权限
  bothMissing: [
    { icon: 'key', text: '小主，需要给我「无障碍」+「悬浮窗」权限，我才能帮你搬砖~' },
    { icon: 'hand-holding-heart', text: '没有权限我只能干看着，授权一下吧小主~' },
    { icon: 'lock-open', text: '小主给个权限吧，我保证好好干活！' },
  ],
  // 缺一个权限（用 {missing} 占位）
  oneMissing: [
    { icon: 'door-open', text: '小主，还需要「{missing}」权限哦，拜托了~' },
    { icon: 'bell', text: '差一步就能开工啦，小主再给个「{missing}」权限吧~' },
  ],
};

/**
 * 根据时段 + 权限状态 + 今日数，返回 idle 话术
 * 优先级：权限缺失 > 时段 + 业务数据
 * @param hour 当前小时（0-23）
 * @param perms 权限状态
 * @param todayCount 今日完成数
 * @param lastIdx 上次抽到的 idx（避免连续重复显示同一条）
 */
function getIdleMessage(
  hour: number,
  perms: { accessibility: boolean; overlay: boolean },
  todayCount: number,
  lastIdx: number
): { msg: IdleMsg; idx: number; data: Record<string, string | number> } {
  const missing: string[] = [];
  if (!perms.accessibility) missing.push('无障碍');
  if (!perms.overlay) missing.push('悬浮窗');

  let pool: IdleMsg[];
  let data: Record<string, string | number> = {};

  if (missing.length === 2) {
    pool = PERMISSION_MESSAGES.bothMissing;
  } else if (missing.length === 1) {
    pool = PERMISSION_MESSAGES.oneMissing;
    data = { missing: missing[0] };
  } else {
    // 时段分流
    let rawPool: IdleMsg[];
    if (hour < 9) {
      rawPool = IDLE_MESSAGES.dawn;
    } else if (hour < 12) {
      rawPool = IDLE_MESSAGES.morning;
    } else if (hour < 18) {
      rawPool = IDLE_MESSAGES.afternoon;
    } else if (hour < 21) {
      rawPool = IDLE_MESSAGES.evening;
    } else {
      // 晚上：有任务看数，无任务鼓励开张
      rawPool = todayCount > 0 ? IDLE_MESSAGES.night.slice(0, 2) : IDLE_MESSAGES.night.slice(2);
    }
    pool = rawPool;
    data = { todayCount };
  }

  // 随机抽一条，排除上次 idx
  const candidates = pool.map((_, i) => i).filter(i => i !== lastIdx);
  const idx = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : 0; // 兜底（pool 只有 1 条时）
  return { msg: pool[idx], idx, data };
}

export default function HomeScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  
  // 状态
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'enabled' | 'disabled'>('checking');
  const [overlayStatus, setOverlayStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('空闲');
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [currentApp, setCurrentApp] = useState<string>('');
  // 2026-06-21 方案B：useState 初始值直接从 BaoliService 内存读（singleton 同步初值）
  const [todayCount, setTodayCount] = useState(() => baoliService.getTodayBaoliCount());
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
  
  // 检查悬浮窗权限状态（首页徽章用）
  const checkOverlayPermission = useCallback(async () => {
    try {
      setOverlayStatus('checking');
      const granted = await zbbAutomation.isOverlayPermissionGranted();
      setOverlayStatus(granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      console.error('检查悬浮窗权限失败:', error);
      setOverlayStatus('denied');
      return false;
    }
  }, []);
  
  // 重新读取今日报备数（用于 DeviceEventEmitter 回调）
  // 2026-06-21 方案B：直接从 emit payload 取 count（跳过 DB 查询，避免 NPE）
  const refreshTodayCount = useCallback((payload?: { count?: number }) => {
    if (payload && typeof payload.count === 'number') {
      setTodayCount(payload.count);
    }
  }, []);

  useEffect(() => {
    // 2026-06-21 方案B：不再调 initDatabase + getTodayBaoliReportCount（内存计数，NPE 源已堵）
    // 保留 initDatabase/getTodayBaoliReportCount import 以备方案C 切换（不删 dead code）
    checkAccessibility();
    checkOverlayPermission();  // 与无障碍一致：mount 时立刻检查一次

    // 订阅报备完成事件（重号 + 第一轮成功 + 第二轮 GO 后触发 +1）
    // 2026-06-21 方案B：emit payload 携带 count，refreshTodayCount 直接 setTodayCount
    const subscription = DeviceEventEmitter.addListener('zbbReportCompleted', refreshTodayCount);
    return () => subscription.remove();
  }, [checkAccessibility, checkOverlayPermission, refreshTodayCount]);

  // ================== 8 秒倒计时浮窗（2026-06-21 老板拍板方案 A） ==================
  // 千机收到消息 → QianjiService 8s delay + emit zbbQianjiCountdownStart
  // 沉默即同意：cooldown 中 / 8s 内没点 → 直接开
  // 点"让小的歇会" → setCooldown(3)
  // 点"立即干活" → 立即开
  const { isInCooldown, setCooldown } = useCooldown();
  const [countdownVisible, setCountdownVisible] = useState(false);

  useEffect(() => {
    const startListener = DeviceEventEmitter.addListener(
      'zbbQianjiCountdownStart',
      (payload?: { seconds?: number; cooldownMinutes?: number }) => {
        // 老板"先睡了"等价模式：cooldown 中跳过浮窗直接开
        if (isInCooldown()) {
          logToBoth('info', '[千机浮窗] cooldown 中，跳过浮窗直接开');
          DeviceEventEmitter.emit('zbbQianjiCountdownEnd', { decision: 'go' });
          return;
        }
        logToBoth('info', `[千机浮窗] 收到 ${payload?.seconds ?? 8}s 倒计时事件，弹浮窗`);
        setCountdownVisible(true);
      },
    );
    return () => startListener.remove();
  }, [isInCooldown]);

  // 页面聚焦时重新检查两个权限状态
  // 用户从系统设置返回 ZBB 首页时，权限状态可能已变化，需 recheck
  // （无障碍和悬浮窗都在系统设置里授权——离开 app 必须 recheck）
  useFocusEffect(
    useCallback(() => {
      checkAccessibility();
      checkOverlayPermission();
    }, [checkAccessibility, checkOverlayPermission])
  );

  // 兜底：App 从 background 回到 active 时重新检查权限
  // （useFocusEffect 在 expo-router 跳系统设置再回首页时，焦点事件边界条件不可靠）
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAccessibility();
        checkOverlayPermission();
      }
    });
    return () => subscription?.remove();
  }, [checkAccessibility, checkOverlayPermission]);

  // ================== 空闲态情绪话术 ==================
  // 记录上次抽到的 idx（避免连续重复显示同一条）
  const lastIdleIdxRef = useRef<number>(-1);

  // 计算话术（useMemo 缓存，hour/perms/todayCount 变化才重算）
  const idleMsg = useMemo(() => getIdleMessage(
    new Date().getHours(),
    {
      accessibility: serviceStatus === 'enabled',
      overlay: overlayStatus === 'granted',
    },
    todayCount,
    lastIdleIdxRef.current
  ), [serviceStatus, overlayStatus, todayCount, isRunning, pendingAutoStart]);

  // commit 后同步 idx 到 ref（下次重算时排除本次）
  useEffect(() => {
    lastIdleIdxRef.current = idleMsg.idx;
  }, [idleMsg.idx]);

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
          'baoli',  // 来源为千机端（项目类型写死 baoli，因为 insertReport 签名只接受 'baoli' | 'yuexiu'，千机来源通过 sourceChannel 字段区分）
          JSON.stringify(result),
          result.reportTime || ''
        );
        
        logToBoth('success', `[ZBB] 已写入数据库，记录ID: ${reportId}`);
        setTodayCount(prev => prev + 1);
        setCustomerInfo({ name: result.customerName, phone: result.phone });
        
        // 清空输入框
        setClipboardText('');
        setPendingAutoStart(false);
        
        // 自动启动报备流程（W8 V2 化）
        if (result.projectType === 'baoli') {
          logToBoth('info', '[ZBB] 自动启动保利端 (V2)...');
          setCurrentStep('自动启动保利端');
          setCurrentApp('baoli');
          // V2 入口：emit ON_QIANJI_DATA_READY（已在千机 startQianjiFlowV2 内部完成）
          // 这里启动保利的 P1-P7 启动段，P8-P15 由 event 触发 fillForm
          const v2Result = await baoliService.startBaoliLaunchV2();
          if (v2Result.success) {
            setCurrentStep('流程已启动（V2 异步处理中）');
            Alert.alert('流程已启动', `客户 ${result.customerName} 保利端异步处理中，完成后会通过 GO 按钮通知。`);
          } else {
            Alert.alert('启动失败', v2Result.error || '保利端启动失败');
          }
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

  // 共享：检查悬浮窗 + 无障碍两个权限
  // 任何一个未授权就弹 alert（带"去设置"按钮），返回 false 让调用方 return
  // handleStart 还要继续 check MediaProjection（不归本函数管）
  const checkOverlayAndAccessibility = useCallback(async (): Promise<boolean> => {
    const hasOverlay = await zbbAutomation.isOverlayPermissionGranted();
    if (!hasOverlay) {
      Alert.alert(
        '请开启悬浮窗',
        'ZBB 需要"显示在其他应用上方"权限才能运行自动化流程。\n请先点击上方"悬浮窗"按钮授权。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '去设置',
            onPress: async () => {
              try {
                await zbbAutomation.openOverlaySettings();
              } catch (error) {
                console.error('打开悬浮窗设置失败:', error);
              }
            },
          },
        ]
      );
      return false;
    }

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
            },
          },
        ]
      );
      return false;
    }

    return true;
  }, [serviceStatus]);

  // 启动流程
  const handleStart = useCallback(async () => {
    // 0. 检查悬浮窗 + 无障碍
    if (!(await checkOverlayAndAccessibility())) return;

    // 1. 检查 MediaProjection 权限（OCR 业务需要）
    const hasProjection = await zbbAutomation.requestMediaProjectionPermission();
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
              const granted = await zbbAutomation.requestMediaProjectionPermission();
              if (!granted) {
                Alert.alert('权限被拒绝', '您已拒绝屏幕截图权限，OCR 功能将无法使用。');
              }
            }
          },
        ]
      );
      return;
    }
    
    // 2. 直接启动完整流程
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
  }, [checkOverlayAndAccessibility, handleStepUpdate, router]);

  // 测试越秀端企业微信流程
  const handleTestYuexiu = useCallback(async () => {
    // 检查悬浮窗 + 无障碍
    if (!(await checkOverlayAndAccessibility())) return;

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
  }, [checkOverlayAndAccessibility, router]);

  // 测试保利端流程（独立服务）
  const handleTestBaoli = useCallback(async () => {
    // 检查悬浮窗 + 无障碍
    if (!(await checkOverlayAndAccessibility())) return;

    try {
      setIsRunning(true);
      setCurrentStep('保利端测试 (V2)...');
      setCurrentApp('wechat');

      const result = await baoliService.startBaoliLaunchV2();
      
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
  }, [checkOverlayAndAccessibility, router]);

  // 测试千机端流程
  const handleTestQianji = useCallback(async () => {
    // 检查悬浮窗 + 无障碍
    if (!(await checkOverlayAndAccessibility())) return;

    try {
      setIsRunning(true);
      setCurrentStep('千机端测试 (V2)...');
      setCurrentApp('qianji');
      // 启动千机端完整流程（V2 异步派发）
      await qianjiService.startQianjiFlowV2();

      setIsRunning(false);
      setCurrentStep('千机端流程完成');
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
  }, [checkOverlayAndAccessibility, router, baoliService, qianjiService]);

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
              Action Surrogate
            </ThemedText>
            <ThemedText variant="caption" color={theme.textMuted}>
              Disconnect to reconnect with life.
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
            {/* 悬浮窗权限状态 */}
            <TouchableOpacity
              style={[
                styles.statusBadge,
                {
                  backgroundColor: (overlayStatus === 'granted' ? '#10B981' : '#FF4444') + '20',
                  marginTop: 4
                }
              ]}
              onPress={async () => {
                // 已授权 → recheck；未授权 → 跳设置
                // 跟无障碍不一样：悬浮窗权限必须在系统设置中授权（app 外），
                // 所以点未授权徽章直接跳设置，比 alert 二段式更直接
                if (overlayStatus === 'granted') {
                  checkOverlayPermission();
                } else {
                  try {
                    await zbbAutomation.openOverlaySettings();
                  } catch (error) {
                    console.error('打开悬浮窗设置失败:', error);
                  }
                }
              }}
            >
              <View style={[styles.statusDot, { backgroundColor: overlayStatus === 'granted' ? '#10B981' : '#FF4444' }]} />
              <Text style={[styles.statusText, { color: overlayStatus === 'granted' ? '#10B981' : '#FF4444' }]}>
                悬浮窗 {overlayStatus === 'granted' ? '已开启' : overlayStatus === 'denied' ? '未授权' : '检查中...'}
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
              /* 正常空闲状态 - 拟人化情绪话术 */
              <View style={[styles.idleCard, { backgroundColor: theme.backgroundDefault }]}>
                <FontAwesome6 name={idleMsg.msg.icon as any} size={24} color={theme.primary} />
                <Text style={[styles.idleText, { color: theme.textSecondary }]}>
                  {idleMsg.msg.text.split(/(\{\w+\})/).map((part, i) => {
                    const m = part.match(/^\{(\w+)\}$/);
                    if (m && idleMsg.data[m[1]] !== undefined) {
                      return (
                        <Text key={i} style={{ color: theme.primary, fontWeight: 'bold' }}>
                          {idleMsg.data[m[1]]}
                        </Text>
                      );
                    }
                    return <Text key={i}>{part}</Text>;
                  })}
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
          
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          
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
          {/* 开始干活按钮（原"测试千机端"） */}
          <TouchableOpacity
            style={[styles.consoleButton, { backgroundColor: '#8B5CF620', marginTop: 12 }]}
            onPress={handleTestQianji}
            activeOpacity={0.8}
          >
            <FontAwesome6 name="hammer" size={20} color="#8B5CF6" />
            <Text style={[styles.consoleButtonText, { color: '#8B5CF6', textAlign: 'center' }]}>
              开始干活
            </Text>
            <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
          </TouchableOpacity>

          {/* test 按钮（原"测试保利端"） */}
          <TouchableOpacity
            style={[styles.consoleButton, { backgroundColor: '#F59E0B20', marginTop: 12 }]}
            onPress={handleTestBaoli}
            activeOpacity={0.8}
          >
            <FontAwesome6 name="vial" size={20} color="#F59E0B" />
            <Text style={[styles.consoleButtonText, { color: '#F59E0B', textAlign: 'center' }]}>
              test
            </Text>
            <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        </ScrollView>

      {/* 8 秒倒计时浮窗（2026-06-21 老板拍板方案 A） */}
      <QianjiActionCountdown
        visible={countdownVisible}
        totalSeconds={8}
        onGo={() => {
          setCountdownVisible(false);
          DeviceEventEmitter.emit('zbbQianjiCountdownEnd', { decision: 'go' });
        }}
        onSkip={() => {
          setCountdownVisible(false);
          setCooldown(3);
          DeviceEventEmitter.emit('zbbQianjiCountdownEnd', { decision: 'skip' });
        }}
        onClose={() => {
          // 点背景 = 沉默 = 8s 后组件自然 onGo（沉默即同意）
          setCountdownVisible(false);
        }}
      />
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
    fontSize: 20,
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
