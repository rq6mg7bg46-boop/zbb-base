// client/native/types.ts
// 原生模块共享类型（v2 重构 W6 拆出）
// 来源：native/index.ts L23-64

export interface ElementInfo {
  found: boolean;
  text?: string;
  contentDescription?: string;
  clickable?: boolean;
  enabled?: boolean;
  centerX?: number;
  centerY?: number;
  boundsLeft?: number;
  boundsTop?: number;
  boundsRight?: number;
  boundsBottom?: number;
  boundsCenterX?: number;
  boundsCenterY?: number;
  bounds?: { left: number; top: number; right: number; bottom: number; centerX?: number; centerY?: number };
  viewId?: string;
  packageName?: string;
  className?: string;
}

export interface ClickableElement extends ElementInfo {
  index: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AccessibilityServiceStatus {
  isRunning: boolean;
  isEnabled: boolean;
  timestamp: number;
}

export interface QianjiMessagePayload {
  package: string;
  title: string;
  text: string;
  subText: string;
  bigText: string;
  timestamp: number;
  source: 'notification' | 'accessibility';
}
