import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import { LoginCredentials } from '../types';
import { healthCheck } from '../services/api';
import Logo from '../components/Logo';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [loginTimeout, setLoginTimeout] = useState<NodeJS.Timeout | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials>();

  useEffect(() => {
    console.log('LoginPage: Component mounted');
    
    // Run health check to verify backend connectivity
    const runHealthCheck = async () => {
      const isHealthy = await healthCheck();
      if (isHealthy) {
        console.log('LoginPage: Backend health check passed');
      } else {
        console.error('LoginPage: Backend health check failed - login may not work');
        alert('Warning: Cannot connect to the backend server. Please ensure the backend is running on port 8123.');
      }
    };
    
    runHealthCheck();
    
    return () => {
      console.log('LoginPage: Component unmounted');
      if (loginTimeout) {
        clearTimeout(loginTimeout);
        console.log('LoginPage: Cleared login timeout on unmount');
      }
    };
  }, [loginTimeout]);

  const onSubmit = async (data: LoginCredentials) => {
    console.log('LoginPage: Form submitted with data:', {
      username: data.username,
      password: data.password ? '[REDACTED]' : 'empty'
    });
    
    if (!data.username || !data.password) {
      console.error('LoginPage: Missing credentials', {
        hasUsername: !!data.username,
        hasPassword: !!data.password
      });
      return;
    }

    console.log('LoginPage: Setting loading to true');
    setIsLoading(true);
    
    // Set up a timeout to catch stuck logins
    const timeoutId = setTimeout(() => {
      console.error('LoginPage: Login timeout after 30 seconds - forcing loading to false');
      setIsLoading(false);
      alert('Login is taking too long. Please try again.');
    }, 30000);
    
    setLoginTimeout(timeoutId);

    const startTime = Date.now();
    
    try {
      console.log('LoginPage: About to call login function from AuthContext');
      
      await login(data);
      
      const endTime = Date.now();
      console.log(`LoginPage: Login successful in ${endTime - startTime}ms`);
      
      console.log('LoginPage: Navigating to /projects');
      navigate('/projects');
      
    } catch (error: any) {
      const endTime = Date.now();
      console.error(`LoginPage: Login failed after ${endTime - startTime}ms`, {
        error: error,
        message: error?.message,
        response: error?.response,
        status: error?.response?.status,
        data: error?.response?.data
      });
      
      // Show user-friendly error message
      const errorMessage = error?.response?.data?.detail || 
                          error?.message || 
                          'Login failed. Please check your credentials and try again.';
      
      console.log('LoginPage: Showing error message to user:', errorMessage);
      alert(`Login failed: ${errorMessage}`);
      
    } finally {
      console.log('LoginPage: Clearing timeout and setting loading to false');
      if (loginTimeout) {
        clearTimeout(loginTimeout);
        setLoginTimeout(null);
      }
      setIsLoading(false);
      console.log('LoginPage: Login process completed, isLoading set to false');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center mb-4">
            <Logo size={80} />
          </div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            BSMarker
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Bird Song Annotation Tool
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" name="remember" defaultValue="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                {...register('username', { required: 'Email is required' })}
                type="email"
                autoComplete="email"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                {...register('password', { required: 'Password is required' })}
                type="password"
                autoComplete="current-password"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;