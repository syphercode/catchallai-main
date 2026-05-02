// React context that owns the authenticated user and the app's load state.
// On boot it fetches the app's public settings and (when a token is present)
// the current user, then exposes them — plus a `refetchUser` method — to the
// rest of the app. The `useAuth` hook below is the only sanctioned consumer.
//
// `useUser` (in src/hooks/useUser.ts) is a thin convenience wrapper that
// derives role flags from the user object; new code should usually go
// through `useUser` rather than `useAuth` unless it needs the full context
// (e.g. ProtectedRoute reading `isAuthenticated`/`authError`).

import { createContext, useState, useContext, useEffect, useCallback, type ReactNode } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import type { User } from '@/types/user';

// `string & {}` preserves literal-string autocomplete on the known reasons
// while still accepting arbitrary server-provided values (see the dynamic
// `reason` path in checkAppState). Plain `| string` would collapse the union
// down to `string` and erase the autocomplete benefit.
type AuthErrorReason = 'auth_required' | 'user_not_registered' | 'unknown' | (string & {});

type AuthError = {
  type: AuthErrorReason;
  message: string;
};

// Public settings returned by the Base44 app endpoint. Only the fields the
// frontend reads are listed; the rest stays opaque.
type AppPublicSettings = {
  id?: string;
  public_settings?: Record<string, unknown>;
  [key: string]: unknown;
};

// Errors thrown by the Base44 SDK / axios client — `status`/`message`/`data`
// are the fields callers actually read. Casting to this shape inside catch
// blocks keeps the narrowing local without polluting the rest of the file.
type SdkError = {
  status?: number;
  message?: string;
  data?: { extra_data?: { reason?: string } };
};

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isLoadingPublicSettings: boolean;
  authError: AuthError | null;
  appPublicSettings: AppPublicSettings | null;
  logout: (shouldRedirect?: boolean) => void;
  navigateToLogin: () => void;
  checkAppState: () => Promise<void>;
  refetchUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isLoginPath = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.location.pathname === '/login';
};

const getSafeReturnUrl = (): string => {
  if (typeof window === 'undefined') {
    return '/';
  }
  const currentUrl = new URL(window.location.href);
  return currentUrl.toString();
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  // Only `{ id, public_settings }` is read off this in practice.
  const [appPublicSettings, setAppPublicSettings] = useState<AppPublicSettings | null>(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async (): Promise<void> => {
    if (isLoginPath()) {
      // When on the login page, clear all auth-derived state so we don't
      // expose stale user/app data while isAuthenticated is false.
      setUser(null);
      setAppPublicSettings(null);
      setAuthError(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      return;
    }

    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `${appParams.serverUrl}/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId,
        },
        token: appParams.token, // Include token if available
        interceptResponses: true,
      });

      try {
        // `interceptResponses: true` makes the client return the unwrapped
        // body, but the SDK's types still describe an AxiosResponse — cast.
        const publicSettings = (await appClient.get(
          `/prod/public-settings/by-id/${appParams.appId}`
        )) as unknown as AppPublicSettings;
        setAppPublicSettings(publicSettings);

        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (rawError) {
        const appError = rawError as SdkError;
        console.error('App state check failed:', appError);

        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required',
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app',
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message ?? 'Failed to load app',
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message ?? 'Failed to load app',
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (rawError) {
      const error = rawError as SdkError;
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message ?? 'An unexpected error occurred',
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async (): Promise<void> => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = (await base44.auth.me()) as User;
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (rawError) {
      const error = rawError as SdkError;
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required',
        });
      }
    }
  };

  // Refetches the current user from the server and updates context state.
  // Call sites that previously did
  //   queryClient.invalidateQueries({ queryKey: ['current-user'] })
  // should now call this instead — the user is owned by AuthContext, not React Query.
  // Empty dep array is safe — setUser / setIsAuthenticated / setAuthError are
  // stable across renders per React's useState contract. Stable identity
  // matters for consumers that pass `refetchUser` to `useCallback` deps
  // (e.g. Layout.jsx's favorite-link handlers) — without `useCallback` here,
  // those handlers recreate on every AuthProvider render.
  const refetchUser = useCallback(async (): Promise<User | null> => {
    try {
      const currentUser = (await base44.auth.me()) as User;
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return currentUser;
    } catch (rawError) {
      const error = rawError as SdkError;
      console.error('refetchUser failed:', error);
      if (error.status === 401 || error.status === 403) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required',
        });
      }
      return null;
    }
  }, []);

  const logout = (shouldRedirect = true): void => {
    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = (): void => {
    if (isLoginPath()) {
      return;
    }
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(getSafeReturnUrl());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState,
        refetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
