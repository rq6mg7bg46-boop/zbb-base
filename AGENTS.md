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
**双包管理器共存**（E470 和家里环境不同，需分别处理）：

| 环境 | 包管理器 | 安装命令 | 生成的 lockfile |
|------|---------|---------|----------------|
| **E470**（公司 Win10 + 真机） | npm | `npm install --prefix client --no-package-lock` | `client/package-lock.json` 入库 |
| **家里 WSL** | pnpm | `pnpm install` | `pnpm-lock.yaml` 入库 |

**为什么不用 junction 缩短路径**：gradle prefab 用 canonical 路径做严格检查（仅 release 触发），junction 单向透明无效 → 必须保持 `D:\projects\project_coze0520` 原路径。

**为什么不用 `npm install --ignore-scripts`**：npm 不读 pnpm-lock.yaml，会导致 13 个 RN native module 报 `No variants exist` 而构建失败。

**Android 目录**：`client/android/`，所有 gradle 操作需先 `cd client/android`。

```bash
# ===== E470 =====
cd D:\projects\project_coze0520
npm install --prefix client --no-package-lock

# ===== 家里 WSL =====
cd /mnt/d/projects/project_coze0520
pnpm install

# ===== 添加新依赖 =====
# E470 (client)
npm install <package> --prefix client --no-package-lock

# 家里 (client)
pnpm add <package> --filter client

# 家里 (server)
pnpm add <package> --filter server
```

**网络问题处理**：`npx expo install` 可能因网络原因失败，失败时重试 2 次，仍失败则在 E470 上改用 `npm install <pkg> --prefix client --no-package-lock`，家里用 `pnpm add`。

**pnpm 版本陷阱**：pnpm 11 需要 Node 22.13+（Node 20 用 pnpm 10）。装新 pnpm 后 `pnpm --version` 仍显示旧版时，关掉 PS 窗口重开。

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
