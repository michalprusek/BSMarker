import React from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useParams,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import AnnotationEditorV2 from "./pages/AnnotationEditorV2";
import AdminUsersPage from "./pages/AdminUsersPage";

const router = createBrowserRouter(
  [
    {
      path: "/login",
      element: <LoginPage />,
    },
    {
      element: <ProtectedRoute />,
      children: [
        {
          // Full-screen editor, outside the page layout.
          path: "/recordings/:recordingId/annotate-v2",
          element: <AnnotationEditorV2 />,
        },
        {
          element: <Layout />,
          children: [
            {
              path: "/",
              element: <Navigate to="/projects" replace />,
            },
            {
              path: "/projects",
              element: <ProjectsPage />,
            },
            {
              path: "/projects/:projectId",
              element: <ProjectDetailPage />,
            },
            {
              // Old editor URL (bookmarks, links) — the editor was replaced.
              path: "/recordings/:recordingId/annotate",
              element: <RedirectToEditor />,
            },
            {
              path: "/admin/users",
              element: <AdminUsersPage />,
            },
          ],
        },
      ],
    },
  ],
  {
    future: {},
  },
);

function RedirectToEditor() {
  const { recordingId } = useParams<{ recordingId: string }>();
  return <Navigate to={`/recordings/${recordingId}/annotate-v2`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" />
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
