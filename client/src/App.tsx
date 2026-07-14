import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import MyNav from './pages/MyNav';
import NavMgr from './pages/Admin/NavMgr';
import UserMgr from './pages/Admin/UserMgr';
import SystemSettings from './pages/Admin/SystemSettings';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';

// 路由守卫：仅 ADMIN 可访问
function AdminRoute({ children }: { children: JSX.Element }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'ADMIN') return <Navigate to="/login" replace />;
  return children;
}

// 登录守卫：已登录则跳转首页
function PublicOnly({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/" replace />;
  return children;
}

// 登录守卫：未登录跳转登录页
function PrivateRoute({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  // 挂载时全局拉取公开系统设置（站点名称、描述、ICP 等）
  useEffect(() => {
    useSettingsStore.getState().load();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/profile"
        element={
          <PrivateRoute>
            <Profile />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={<Settings />}
      />
      <Route
        path="/my/nav"
        element={
          <PrivateRoute>
            <MyNav />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/nav"
        element={
          <AdminRoute>
            <NavMgr />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <UserMgr />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/system"
        element={
          <AdminRoute>
            <SystemSettings />
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
