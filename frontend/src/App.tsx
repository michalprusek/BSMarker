import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import AnnotationEditor from './pages/AnnotationEditor';
import AdminUsersPage from './pages/AdminUsersPage';

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            path: "/",
            element: <Navigate to="/projects" replace />
          },
          {
            path: "/projects",
            element: <ProjectsPage />
          },
          {
            path: "/projects/:projectId",
            element: <ProjectDetailPage />
          },
          {
            path: "/recordings/:recordingId/annotate",
            element: <AnnotationEditor />
          },
          {
            path: "/admin/users",
            element: <AdminUsersPage />
          }
        ]
      }
    ]
  }
]);

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" />
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;