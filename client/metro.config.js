const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// 忽略父目录的 node_modules（解决 Windows 路径问题）
config.watchFolders = [__dirname];
config.resolver.blockList = [
  /node_modules\/.*\/node_modules\/node_modules/,
  /\.\.\/node_modules/,
  /E:\\ZBB\\projects_coze0426\\node_modules/,
];

module.exports = config;
