import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../utils/permissions.js';

export default function RequirePermissionRoute({ permission, children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!permission || hasPermission(user, permission)) {
    return children;
  }

  return (
    <Navigate
      to="/acesso-negado"
      replace
      state={{ from: `${location.pathname}${location.search}${location.hash}` }}
    />
  );
}
