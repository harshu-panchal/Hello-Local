import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api/config';
import { currentPortal, getAuthToken, portalForUserType, sessionSnapshot, setSession,
  setStoredUser, subscribeSession, getStoredUser, clearSession } from '../services/api/session';
import { registerFCMToken } from '../services/pushNotificationService';
import { endSession } from '../services/authSession';

interface User {
  id: string;
  userType?: 'Admin' | 'Seller' | 'Customer' | 'Delivery';
  [key: string]: any;
}
interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
  updateUser: (userData: User) => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Router navigation rerenders the provider; snapshots immediately use the new
  // portal, so guards never render with the previous portal's identity.
  useLocation();
  const portal = currentPortal();
  const snapshot = useSyncExternalStore(subscribeSession, () => sessionSnapshot(portal), () => '{"token":null,"user":null}');
  const { token, user } = useMemo(() => {
    const stored = JSON.parse(snapshot) as { token: string | null; user: User | null };
    if (stored.user && !stored.user.userType) {
      stored.user = { ...stored.user, userType: ({ admin: 'Admin', seller: 'Seller', delivery: 'Delivery', customer: 'Customer' } as const)[portal] };
    }
    return stored;
  }, [snapshot, portal]);
  const isAuthenticated = !!(token && user);

  useEffect(() => {
    if (!token || !user) return;
    let active = true;
    void registerFCMToken(true, { requestPermission: false });
    api.get('/auth/session', { sessionPortal: portal }).then(response => {
      if (!active || getAuthToken(portal) !== token) return;
      const stored = getStoredUser<User>(portal);
      const status = response.data?.data?.status;
      if (stored && status && stored.status !== status) setStoredUser({ ...stored, status }, portal);
    }).catch(() => { /* The API interceptor handles invalid sessions. */ });
    // Expired credentials should not keep a portal appearing signed in while idle.
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof payload.exp === 'number') {
        const checkExpiry = () => {
          if (!active || getAuthToken(portal) !== token) return;
          const remaining = payload.exp * 1000 - Date.now();
          if (remaining <= 0) clearSession(portal);
          else expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
        };
        checkExpiry();
      }
    } catch { /* The server validates malformed tokens. */ }
    return () => { active = false; if (expiryTimer) clearTimeout(expiryTimer); };
  }, [token, portal]);

  const login = (newToken: string, userData: User) => {
    const target = portalForUserType(userData.userType || userData.role);
    setSession(newToken, userData, target);
    if (target === currentPortal()) void registerFCMToken(true);
  };
  const logout = () => endSession(portal);
  const updateUser = (userData: User) => {
    // Ignore a delayed response belonging to the previous account/portal.
    if (user && userData.id === user.id && getAuthToken(portal) === token) setStoredUser(userData, portal);
  };
  return <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
