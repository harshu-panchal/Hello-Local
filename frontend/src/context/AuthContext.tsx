import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  getAuthToken,
  removeAuthToken,
  setAuthToken,
} from "../services/api/config";
import { getStoredUser, setStoredUser } from "../services/api/session";

interface User {
  id: string;
  userType?: "Admin" | "Seller" | "Customer" | "Delivery";
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
  // Initialize state synchronously from localStorage
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const storedToken = getAuthToken();
    const storedUser = getStoredUser();
    return !!(storedToken && storedUser);
  });

  const [user, setUser] = useState<User | null>(() => getStoredUser<User>());

  const [token, setToken] = useState<string | null>(() => {
    return getAuthToken();
  });

  // Effect to sync state if localStorage changes externally or on mount validation
  useEffect(() => {
    const storedToken = getAuthToken();
    const storedUser = getStoredUser<User>();

    if (storedToken && storedUser) {
      if (!isAuthenticated || token !== storedToken) {
        setToken(storedToken);
        setUser(storedUser);
        setIsAuthenticated(true);
      }
    } else if (isAuthenticated) {
      // Logged out
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  const login = (newToken: string, userData: User) => {
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    setAuthToken(newToken);
    setStoredUser(userData);

    // Register this device for push notifications.
    //
    // A debug call to /fcm-tokens/test used to fire here, so every user of every
    // portal received a "test push notification" on each sign-in. (#H-26)
    import("../services/pushNotificationService").then(({ registerFCMToken }) => {
      registerFCMToken(true).catch((error) => {
        console.error("Failed to register FCM token:", error);
      });
    });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    removeAuthToken();

    // Remove FCM token on logout
    import("../services/pushNotificationService").then(({ removeFCMToken }) => {
      removeFCMToken().catch((error) => {
        console.error("Failed to remove FCM token:", error);
      });
    });
  };

  const updateUser = (userData: User) => {
    setUser(userData);
    setStoredUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        token,
        login,
        logout,
        updateUser,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
