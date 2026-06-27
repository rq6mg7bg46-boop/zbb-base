// client/actions/index.ts
// 统一导出（每个 Action 文件 commit 后逐步补全）
// v2 设计文档 §5.2

export * from './types';
export { delay, gammaDelay, randomDelay } from './delay';
export { findText, findAllText, findExactNode, findNodeCenter, getAllTextNodes } from './find';
export type { TextNode } from './find';
export { tap, tapWithRetry } from './tap';
export { longPress } from './longpress';
export { inputText, pasteFromClipboard } from './input';
export type { InputTarget } from './input';