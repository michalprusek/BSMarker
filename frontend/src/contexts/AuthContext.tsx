import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User, LoginCredentials } from "../types";
import { authService, setAuthToken } from "../services/api";
import toast from "react-hot-toast";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const token = localStorage.getItem("token");

      if (token) {
        const userData = await authService.getCurrentUser();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error: any) {
      console.error("Failed to fetch user:", error);
      // Only remove token on actual auth errors
      if (
        error.response?.status === 401 ||
        (error.response?.status === 403 &&
          (error.response?.data?.detail?.toLowerCase().includes("credential") ||
            error.response?.data?.detail?.toLowerCase().includes("token") ||
            error.response?.data?.detail?.toLowerCase().includes("expired") ||
            error.response?.data?.detail?.toLowerCase().includes("invalid") ||
            error.response?.data?.detail
              ?.toLowerCase()
              .includes("unauthorized")))
      ) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
      // For network errors, keep token but set user to null temporarily
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    // Failsafe timeout - if loading doesn't finish in 5 seconds, force it to false
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      const loginResponse = await authService.login(credentials);

      if (!loginResponse.access_token) {
        throw new Error("No access token received");
      }

      setAuthToken(loginResponse.access_token);
      await refreshUser();

      toast.success("Successfully logged in!");
    } catch (error: any) {
      console.error("Login error:", error);
      const errorMessage =
        error.response?.data?.detail || error?.message || "Login failed";
      toast.error(errorMessage);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    toast.success("Logged out successfully");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
