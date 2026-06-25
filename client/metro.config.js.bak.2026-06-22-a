const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// 2026-06-19: watch root too so expo-router (hoisted by npm workspaces)
// can be resolved when bundled into the debug APK.
config.watchFolders = [__dirname, path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '..', 'node_modules'),
];
config.resolver.blockList = [
    /node_modules\/.*\/node_modules\/node_modules/,
    /E:\\ZBB\\projects_coze0426\\node_modules/,
];

module.exports = config;
