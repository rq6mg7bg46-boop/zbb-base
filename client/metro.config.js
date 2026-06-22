const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// 2026-06-22b: 修复 release 编译 expo export:embed 找不到 expo-router/entry.js。
// 根因链：
//   1. react-native gradle plugin 的 Os.cliPath() 在 Windows 上把绝对路径转成相对路径
//      （相对 react.root，默认 = client/），所以 --entry-file 收到 "node_modules/expo-router/entry.js"。
//   2. expo CLI 的 legacySinglePageExportBundleAsync 内部给非绝对路径加 "./" 前缀
//      → "./node_modules/expo-router/entry.js"。
//   3. metro 用 projectRoot 解析相对路径。在某些情况下 expo CLI 的 metro server projectRoot
//      落到根目录（D:\projects\project_coze0520/），而不是 client/。
//      根目录的 node_modules/expo-router/entry.js 不存在（expo-router 在 client/node_modules），
//      所以报 "Unable to resolve module ./node_modules/expo-router/entry.js from ...:/."。
// 修复：用 resolveRequest 拦截 expo CLI 加 "./" 前缀的路径，重定向到 bare module name，
//       走 metro 标准 node_modules 解析（自动找 client/node_modules/expo-router/entry.js）。
// 同时显式设 projectRoot = __dirname（client/），并把根目录的 node_modules 加进
// nodeModulesPaths 兜底，防止 expo CLI 把 projectRoot 解析到根目录时找不到依赖。
config.projectRoot = projectRoot;
config.watchFolders = [projectRoot];

config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(projectRoot, '..', 'node_modules'),
    path.resolve(projectRoot, '..', '..', 'node_modules'),
];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    // expo CLI 加 './' 前缀的 entry file 路径，重定向到 bare module
    if (moduleName.startsWith('./node_modules/expo-router/entry')) {
        return context.resolveRequest(context, 'expo-router/entry', platform);
    }
    return defaultResolveRequest
        ? defaultResolveRequest(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
};

config.resolver.blockList = [
    /node_modules\/.*\/node_modules\/node_modules/,
    /E:\\ZBB\\projects_coze0426\\node_modules/,
];

module.exports = config;