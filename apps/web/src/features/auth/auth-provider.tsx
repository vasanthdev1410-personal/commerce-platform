'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiRequest } from '@/lib/api/client';
import type {
  AuthResponse,
  AuthUser,
  LoginInput,
  RegisterInput,
} from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refresh: () => Promise<boolean>;
  loadCurrentUser: (token?: string) => Promise<AuthUser>;
  authenticatedRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const initializedRef = useRef(false);

  const storeAccessToken = useCallback((token: string | null) => {
    accessTokenRef.current = token;
    setAccessToken(token);
  }, []);

  const clearAuth = useCallback(() => {
    storeAccessToken(null);
    setUser(null);
  }, [storeAccessToken]);

  const loadCurrentUser = useCallback(
    async (token?: string): Promise<AuthUser> => {
      const activeToken = token ?? accessTokenRef.current;
      if (!activeToken) throw new ApiError(401, 'Authentication required');
      const currentUser = await apiRequest<AuthUser>('/auth/me', {
        headers: { authorization: `Bearer ${activeToken}` },
      });
      setUser(currentUser);
      return currentUser;
    },
    [],
  );

  const performRefresh = useCallback(async (): Promise<string | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const refreshOperation = (async () => {
      try {
        const result = await apiRequest<AuthResponse>('/auth/refresh', {
          method: 'POST',
        });
        storeAccessToken(result.accessToken);
        await loadCurrentUser(result.accessToken);
        return result.accessToken;
      } catch {
        clearAuth();
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = refreshOperation;
    return refreshOperation;
  }, [clearAuth, loadCurrentUser, storeAccessToken]);

  const refresh = useCallback(
    async () => (await performRefresh()) !== null,
    [performRefresh],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void performRefresh().finally(() => setIsLoading(false));
  }, [performRefresh]);

  const completeAuthentication = useCallback(
    async (result: AuthResponse) => {
      storeAccessToken(result.accessToken);
      try {
        await loadCurrentUser(result.accessToken);
      } catch (error) {
        clearAuth();
        throw error;
      }
    },
    [clearAuth, loadCurrentUser, storeAccessToken],
  );

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: input.email, password: input.password }),
      });
      await completeAuthentication(result);
    },
    [completeAuthentication],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await apiRequest<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          password: input.password,
        }),
      });
      await completeAuthentication(result);
    },
    [completeAuthentication],
  );

  const authenticatedRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const send = (token: string) =>
        apiRequest<T>(path, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init.headers).entries()),
            authorization: `Bearer ${token}`,
          },
        });

      let token = accessTokenRef.current;
      if (!token) token = await performRefresh();
      if (!token) throw new ApiError(401, 'Authentication required');

      try {
        return await send(token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const refreshedToken = await performRefresh();
        if (!refreshedToken) throw error;
        return send(refreshedToken);
      }
    },
    [performRefresh],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ status: 'ok' }>('/auth/logout', { method: 'POST' });
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const logoutAll = useCallback(async () => {
    try {
      await authenticatedRequest<{ status: 'ok' }>('/auth/logout-all', {
        method: 'POST',
      });
    } finally {
      clearAuth();
    }
  }, [authenticatedRequest, clearAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: user !== null && accessToken !== null,
      isLoading,
      login,
      register,
      logout,
      logoutAll,
      refresh,
      loadCurrentUser,
      authenticatedRequest,
    }),
    [
      accessToken,
      authenticatedRequest,
      isLoading,
      loadCurrentUser,
      login,
      logout,
      logoutAll,
      refresh,
      register,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
