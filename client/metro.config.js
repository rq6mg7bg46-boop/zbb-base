const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// 2026-06-22: 去掉 watchFolders 加根。原因：根 package.json 的 main=index.js 但根目录
// 没有 index.js 文件，metro 启动时报 "Unable to resolve module ./index.js from /mnt/d/..."，
// 导致 createBundleReleaseJsAndAssets (expo export:embed) 退出码 1。
// 修复：nodeModulesPaths 已覆盖根 node_modules 的解析需求，不需要 watchFolders 加根。
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '..', 'node_modules'),
];
config.resolver.blockList = [
    /node_modules\/.*\/node_modules\/node_modules/,
    /E:\\ZBB\\projects_coze0426\\node_modules/,
];

module.exports = config;
