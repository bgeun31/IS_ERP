import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  title: string;
  children: React.ReactNode;
}

export default function Layout({ title, children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>인프라보안</h1>
          <p>장비 자산관리</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">📊</span> 대시보드
          </NavLink>
          <NavLink to="/upload" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">📁</span> 로그 업로드
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">📋</span> 로그 목록
          </NavLink>
          {user?.is_admin && (
            <NavLink to="/users" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">👥</span> 사용자 관리
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div><strong>{user?.username}</strong>{user?.is_admin && ' (관리자)'}</div>
          <button className="nav-item" style={{ marginTop: 8, padding: '8px 0' }} onClick={handleLogout}>
            <span className="nav-icon">🚪</span> 로그아웃
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <span className="topbar-title">{title}</span>
          <div className="topbar-right">
            <span className="text-muted text-sm">{user?.username}</span>
          </div>
        </header>
        <main className="page-body">{children}</main>
      </div>
    </div>
  );
}
