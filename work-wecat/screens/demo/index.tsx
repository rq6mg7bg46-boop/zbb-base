import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useEffect } from 'react';

// 导入 Expo 模块用于检查
import * as Camera from 'expo-camera';
import * as Location from 'expo-location';
import * as ExpoAV from 'expo-av';
import { NativeModules } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { styles } from './styles';

export default function DemoPage() {
  const { theme, isDark } = useTheme();

  // 检查所有原生模块和 Expo 模块
  useEffect(() => {
    console.log('=== Expo Module Check ===');
    console.log('Platform: android');
    
    // 1. 检查 NativeModules（原生模块）
    console.log('--- NativeModules ---');
    console.log('NativeModules:', NativeModules);
    console.log('NativeModules keys:', Object.keys(NativeModules));
    
    // 2. 检查 Expo Camera 模块
    console.log('--- Expo Camera ---');
    console.log('Camera module:', Camera);
    console.log('Camera.NativeModules:', (Camera as any).NativeModules);
    
    // 3. 检查 Expo Location 模块
    console.log('--- Expo Location ---');
    console.log('Location module:', Location);
    
    // 4. 检查 Expo AV 模块
    console.log('--- Expo AV ---');
    console.log('ExpoAV module:', ExpoAV);
    
    // 5. 检查 ZBB 模块
    console.log('--- ZBB Module ---');
    console.log('NativeModules.ZBBAutomation:', NativeModules.ZBBAutomation);
    
    console.log('=== Check Complete ===');
  }, []);

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <View
        style={styles.container}
      >
        <Image
          style={styles.logo}
          source="https://lf-coze-web-cdn.coze.cn/obj/eden-cn/lm-lgvj/ljhwZthlaukjlkulzlp/coze-coding/icon/coze-coding.gif"
        ></Image>
        <Text style={{...styles.title, color: theme.textPrimary}}>应用开发中</Text>
        <Text style={{...styles.description, color: theme.textSecondary}}>请稍候，界面即将呈现</Text>
      </View>
    </Screen>
  );
}
