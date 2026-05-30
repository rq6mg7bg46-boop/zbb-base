/**
 * 认证上下文 — 与 ZBB 系统集成
 *
 * 用法：
 * ```tsx
 * // App.tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 *
 * // 任意组件
 * const { user, isAuthenticated, login, logout } = useAuth();
 * ```
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import {
  AuthService,
  checkAuth,
  login as svcLogin,
  logout as svcLogout,
  register as svcRegister,
  fetchMe,
  updateProfile,
  changePassword,
} from "@/src/services/AuthService";
import type { User } from "@/src/api/AuthApi";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (
    username: string,
    password: string,
    extra?: { nickname?: string; phone?: string }
  ) => Promise<{ token: string; user_id: number }>;
  refreshUser: () => Promise<void>;
  updateUserProfile: (data: { nickname?: string; phone?: string }) => Promise<void>;
  changePwd: (old: string, next: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user,     setUser]     = useState<User | null>(null);
  const [token,    setToken]    = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true); // 初始 true，避免闪现

  // 启动时检查本地 token 是否有效
  useEffect(() => {
    checkAuth()
      .then(({ user, token }) => {
        setUser(user);
        setToken(token);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const user = await svcLogin(username, password);
    const tok  = await AuthService.getToken();
    setUser(user);
    setToken(tok);
  }, []);

  const logout = useCallback(async () => {
    await svcLogout();
    setUser(null);
    setToken(null);
  }, []);

  const register = useCallback(
    async (
      username: string,
      password: string,
      extra?: { nickname?: string; phone?: string }
    ) => {
      return svcRegister(username, password, extra);
    },
    []
  );

  const refreshUser = useCallback(async () => {
    try {
      const u = await fetchMe();
      setUser(u);
    } catch (e) {
      console.error("刷新用户信息失败", e);
    }
  }, []);

  const updateUserProfile = useCallback(
    async (data: { nickname?: string; phone?: string }) => {
      const u = await updateProfile(data);
      setUser(u);
    },
    []
  );

  const changePwd = useCallback(
    async (old: string, next: string) => {
      await changePassword(old, next);
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        register,
        refreshUser,
        updateUserProfile,
        changePwd,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
};