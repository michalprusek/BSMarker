import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginCredentials } from '../types';
import { authService } from '../services/api';
import toast from 'react-hot-toast';

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
    throw new Error('useAuth must be used within an AuthProvider');
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
    console.log('AuthContext: Starting refreshUser...');
    try {
      const token = localStorage.getItem('token');
      console.log('AuthContext: Token exists?', !!token);
      
      if (token) {
        console.log('AuthContext: Fetching user data...');
        const userData = await authService.getCurrentUser();
        console.log('AuthContext: User data received:', userData);
        setUser(userData);
        setLoading(false);
        console.log('AuthContext: Loading set to false (with user)');
      } else {
        console.log('AuthContext: No token found');
        setUser(null);
        setLoading(false);
        console.log('AuthContext: Loading set to false (no token)');
      }
    } catch (error) {
      console.error('AuthContext: Failed to fetch user:', error);
      localStorage.removeItem('token');
      setUser(null);
      setLoading(false);
      console.log('AuthContext: Loading set to false (error)');
    }
  };

  useEffect(() => {
    console.log('AuthContext: Mounted, calling refreshUser');
    refreshUser();
    
    // Failsafe timeout - if loading doesn't finish in 5 seconds, force it to false
    const timeout = setTimeout(() => {
      console.log('AuthContext: Failsafe timeout triggered after 5 seconds');
      setLoading(false);
    }, 5000);
    
    return () => clearTimeout(timeout);
  }, []);

  const login = async (credentials: LoginCredentials) => {
    console.log('AuthContext: login() called with username:', credentials.username);
    
    try {
      console.log('AuthContext: About to call authService.login()');
      const startTime = Date.now();
      
      const loginResponse = await authService.login(credentials);
      
      const loginEndTime = Date.now();
      console.log(`AuthContext: authService.login() completed in ${loginEndTime - startTime}ms`);
      console.log('AuthContext: Login response received:', {
        hasAccessToken: !!loginResponse.access_token,
        tokenLength: loginResponse.access_token?.length
      });
      
      if (!loginResponse.access_token) {
        console.error('AuthContext: No access token received from login response');
        throw new Error('No access token received');
      }

      console.log('AuthContext: Storing token in localStorage');
      localStorage.setItem('token', loginResponse.access_token);
      
      console.log('AuthContext: About to call refreshUser()');
      const refreshStartTime = Date.now();
      
      await refreshUser();
      
      const refreshEndTime = Date.now();
      console.log(`AuthContext: refreshUser() completed in ${refreshEndTime - refreshStartTime}ms`);
      
      console.log('AuthContext: Showing success toast');
      toast.success('Successfully logged in!');
      
      const totalEndTime = Date.now();
      console.log(`AuthContext: Total login process completed in ${totalEndTime - startTime}ms`);
      
    } catch (error: any) {
      console.error('AuthContext: Login error caught:', {
        error: error,
        message: error?.message,
        response: error?.response,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        config: error?.config ? {
          url: error.config.url,
          method: error.config.method,
          baseURL: error.config.baseURL,
          timeout: error.config.timeout
        } : null
      });
      
      const errorMessage = error.response?.data?.detail || error?.message || 'Login failed';
      console.log('AuthContext: Showing error toast:', errorMessage);
      toast.error(errorMessage);
      
      console.log('AuthContext: Re-throwing error for LoginPage to catch');
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};