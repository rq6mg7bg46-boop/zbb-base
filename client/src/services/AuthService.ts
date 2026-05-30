/**
 * AuthService — 认证业务逻辑层
 *
 * 功能：
 * - Token 持久化（AsyncStorage）
 * - 登录 / 注册 / 登出 / 获取用户信息
 *
 * 依赖：
 * - AuthApi（HTTP 接口）
 * - @react-native-async-storage/async-storage（Token 存储）
 * - expo-sqlite（本地用户缓存，可选）
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthApi, User } from "../api/AuthApi";
import * as SQLite from "expo-sqlite";

const TOKEN_KEY = "zbb_auth_token";
const USER_DB   = "zbb_auth.db";

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

// ─── 本地用户缓存（SQLite） ──────────────────────────────────

let userDb: SQLite.SQLiteDatabase | null = null;

async function openUserDb(): Promise<SQLite.SQLiteDatabase> {
  if (!userDb) {
    userDb = await SQLite.openDatabaseAsync(USER_DB);
    await userDb.execAsync(`
      CREATE TABLE IF NOT EXISTS cached_user (
        id         INTEGER PRIMARY KEY,
        username   TEXT,
        nickname   TEXT,
        phone      TEXT,
        role       TEXT,
        updated_at INTEGER
      );
    `);
  }
  return userDb;
}

async function cacheUser(user: User): Promise<void> {
  const db = await openUserDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO cached_user (id, username, nickname, phone, role, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, user.username, user.nickname ?? user.username, user.phone ?? "", user.role, Date.now()]
  );
}

async function getCachedUser(): Promise<User | null> {
  const db = await openUserDb();
  return db.getFirstAsync<User>(`SELECT * FROM cached_user LIMIT 1`);
}

async function clearCache(): Promise<void> {
  const db = await openUserDb();
  await db.runAsync(`DELETE FROM cached_user`);
}

// ─── 核心业务 ───────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

/** 检查是否已登录（本地有有效 token） */
export async function checkAuth(): Promise<AuthState> {
  const token = await getToken();
  if (!token) return { user: null, token: null, isLoading: false };

  try {
    const cached = await getCachedUser();
    const user   = cached
      ? { id: cached.id, username: cached.username, nickname: cached.nickname ?? cached.username, phone: cached.phone ?? "", role: cached.role }
      : null;
    return { user, token, isLoading: false };
  } catch {
    return { user: null, token: null, isLoading: false };
  }
}

/** 登录 */
export async function login(username: string, password: string): Promise<User> {
  const res  = await AuthApi.login({ username, password });
  const { token, user } = res.data;
  await saveToken(token);
  await cacheUser(user);
  return user;
}

/** 注册 */
export async function register(
  username: string,
  password: string,
  extra: { nickname?: string; phone?: string } = {}
): Promise<{ token: string; user_id: number }> {
  const res = await AuthApi.register({ username, password, ...extra });
  await saveToken(res.data.token);
  return res.data;
}

/** 登出 */
export async function logout(): Promise<void> {
  await clearToken();
  await clearCache();
}

/** 获取当前用户（从服务器） */
export async function fetchMe(): Promise<User> {
  const token = await getToken();
  if (!token) throw new Error("未登录");
  const res = await AuthApi.me(token);
  await cacheUser(res.data);
  return res.data;
}

/** 更新资料 */
export async function updateProfile(data: { nickname?: string; phone?: string }): Promise<User> {
  const token = await getToken();
  if (!token) throw new Error("未登录");
  const res = await AuthApi.updateProfile(token, data);
  await cacheUser(res.data);
  return res.data;
}

/** 修改密码 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error("未登录");
  await AuthApi.changePassword(token, { old_password: oldPassword, new_password: newPassword });
}