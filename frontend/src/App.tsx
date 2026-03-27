import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardPage from './pages/DashboardPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import DocumentCreatePage from './pages/DocumentCreatePage';
import DocumentHistoryPage from './pages/DocumentHistoryPage';
import DocumentTemplatePage from './pages/DocumentTemplatePage';
import LoginPage from './pages/LoginPage';
import LogListPage from './pages/LogListPage';
import LogUploadPage from './pages/LogUploadPage';
import UserManagementPage from './pages/UserManagementPage';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>로딩 중...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.is_admin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/devices/:name" element={<ProtectedRoute><DeviceDetailPage /></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><LogUploadPage /></ProtectedRoute>} />
      <Route path="/logs" element={<ProtectedRoute><LogListPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute adminOnly><UserManagementPage /></ProtectedRoute>} />
      <Route path="/documents/templates" element={<ProtectedRoute><DocumentTemplatePage /></ProtectedRoute>} />
      <Route path="/documents/create" element={<ProtectedRoute><DocumentCreatePage /></ProtectedRoute>} />
      <Route path="/documents/history" element={<ProtectedRoute><DocumentHistoryPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
