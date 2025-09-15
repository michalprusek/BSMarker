import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import LoadingSpinner from "./LoadingSpinner";

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  console.log("ProtectedRoute: loading =", loading, "user =", user);

  if (loading) {
    console.log("ProtectedRoute: Showing loading spinner");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  console.log(
    "ProtectedRoute: Redirecting to",
    user ? "protected content" : "login",
  );
  return user ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
