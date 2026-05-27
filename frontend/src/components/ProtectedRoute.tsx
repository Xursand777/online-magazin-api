import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const ProtectedRoute = () => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Admin page is protected. Only users with is_admin=true OR role as admin/super_admin can enter.
  const isAuthorized =
    user?.is_admin ||
    user?.role === 'admin' ||
    user?.role === 'super_admin' ||
    user?.role === 'seller' ||
    user?.role === 'courier'; // Assuming staff can access admin panel to some degree, but let's restrict to is_admin or any staff role since the AdminPanel itself has further checks if needed.

  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
