# Expo App + Express.js

## 目录结构规范（严格遵循）

当前仓库是一个 monorepo（基于 pnpm 的 workspace）

- Expo 代码在 client 目录，Express.js 代码在 server 目录
- 本模板默认无 Tab Bar，可按需改造

目录结构说明

├── server/                     # 服务端代码根目录 (Express.js)
|   ├── src/
│   │   └── index.ts            # Express 入口文件
|   └── package.json            # 服务端 package.json
├── client/                     # React Native 前端代码
│   ├── app/                    # Expo Router 路由目录（仅路由配置）
│   │   ├── _layout.tsx         # 根布局文件（必需，务必阅读）
│   │   ├── home.tsx            # 首页
│   │   └── index.tsx           # re-export home.tsx
│   ├── screens/                # 页面实现目录（与 app/ 路由对应）
│   │   └── demo/               # demo 示例页面
│   │       ├── index.tsx       # 页面组件实现
│   │       └── styles.ts       # 页面样式
│   ├── components/             # 可复用组件
│   │   └── Screen.tsx          # 页面容器组件（必用）
│   ├── hooks/                  # 自定义 Hooks
│   ├── contexts/               # React Context 代码
│   ├── constants/              # 常量定义（如主题配置）
│   ├── utils/                  # 工具函数
│   ├── assets/                 # 静态资源
|   └── package.json            # Expo 应用 package.json
├── package.json
├── .cozeproj                   # 预置脚手架脚本（禁止修改）
└── .coze                       # 配置文件（禁止修改）

## 依赖管理与模块导入规范

### 依赖安装
**两个环境都用 npm**（统一简化）。Lockfile **不入库**（见 .gitignore），E470 和家里各自 `npm install` 重新生成。

| 目录 | 安装命令 | 说明 |
|------|----------|------|
| `client/` | `npm install` 或 `npx expo install <package>` | Expo 自动选择 SDK 兼容版本 |
| `server/` | `npm install` 或 `npm install <package>` | 后端依赖 |

```bash
# 装全部依赖（根目录会自动装 client + server）
npm install

# 只装 client
npm install --prefix client

# 添加新依赖
npm install <package> --prefix client
npm install <package> --prefix server
```

**网络问题处理**：`npx expo install` 可能因网络原因失败，失败时重试 2 次，仍失败则改用 `pnpm add` 安装

## Expo 开发规范

### 路径别名

Expo 配置了 `@/` 路径别名指向 `client/` 目录：

```tsx
// 正确
import { Screen } from '@/components/Screen';

// 避免相对路径
import { Screen } from '../../../components/Screen';
```

## 本地开发

运行 coze dev 可以同时启动前端和后端服务，如果端口已占用，该命令会先杀掉占用端口的进程再启动，也可以用来重启前端和后端服务

```bash
coze dev
```
