/**
 * AuthApi — HTTP 认证接口客户端
 *
 * 特性：
 * - 纯 TypeScript，无框架依赖，可复用到任何项目
 * - 自动管理 Base URL，可切换 dev/prod 环境
 * - 统一的错误处理
 */

export interface RegisterReq {
  username: string;
  password: string;
  nickname?: string;
  phone?: string;
}

export interface LoginReq {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  nickname: string;
  phone: string;
  role: string;
}

export interface AuthResponse {
  code: number;
  data?: {
    token: string;
    user_id?: number;
    user?: User;
    message?: string;
  };
  message?: string;
}

// ─── 配置 ────────────────────────────────────────────────────

const DEV_BASE_URL = "http://10.0.2.2:9091"; // Android 模拟器访问宿主机
const PROD_BASE_URL = "https://your-domain.com"; // 云端正式环境

const BASE_URL = __DEV__ ? DEV_BASE_URL : PROD_BASE_URL;

// ─── 工具函数 ────────────────────────────────────────────────

async function request<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: object,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const json: AuthResponse = await res.json();

  if (json.code !== 0) {
    throw new Error(json.message ?? `请求失败 (code=${json.code})`);
  }
  return json as T;
}

// ─── API 方法 ───────────────────────────────────────────────

/**
 * 用户注册
 * @example
 * const { token, user_id } = await AuthApi.register({
 *   username: "alice",
 *   password: "123456",
 *   nickname: "爱丽丝",
 *   phone: "13800138000",
 * });
 */
export const AuthApi = {
  /** 健康检查 */
  health: () =>
    request<{ code: 0; data: { status: string; timestamp: number } }>(
      "GET",
      "/api/v1/health"
    ),

  /** 注册 */
  register: (req: RegisterReq) =>
    request<{ code: 0; data: { token: string; user_id: number } }>(
      "POST",
      "/api/v1/auth/register",
      req
    ),

  /** 登录 */
  login: (req: LoginReq) =>
    request<{
      code: 0;
      data: { token: string; user: User };
    }>("POST", "/api/v1/auth/login", req),

  /** 获取当前登录用户信息 */
  me: (token: string) =>
    request<{ code: 0; data: User }>("GET", "/api/v1/me", undefined, token),

  /** 更新个人资料 */
  updateProfile: (
    token: string,
    data: { nickname?: string; phone?: string }
  ) =>
    request<{ code: 0; data: User }>(
      "POST",
      "/api/v1/users/me",
      data,
      token
    ),

  /** 修改密码 */
  changePassword: (
    token: string,
    data: { old_password: string; new_password: string }
  ) =>
    request<{ code: 0; data: { message: string } }>(
      "POST",
      "/api/v1/auth/change-password",
      data,
      token
    ),
};