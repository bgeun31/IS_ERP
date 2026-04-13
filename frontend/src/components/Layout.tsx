import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  title: string;
  children: React.ReactNode;
}

export default function Layout({ title, children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
          <NavLink to="/assets" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">🏢</span> 자산관리
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
          <div style={{ margin: '12px 0 4px', padding: '0 16px', fontSize: 11, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            문서
          </div>
          <NavLink to="/documents/templates" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">🗂️</span> 템플릿 관리
          </NavLink>
          <NavLink to="/documents/create" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">✏️</span> 문서 작성
          </NavLink>
          <NavLink to="/documents/history" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">📋</span> 작업 내역
          </NavLink>
          <div style={{ margin: '12px 0 4px', padding: '0 16px', fontSize: 11, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            전용 템플릿
          </div>
          <NavLink to="/documents/infra-security" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">🛡️</span> 인프라보안
          </NavLink>
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
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: 'fixed', bottom: 32, right: 32, zIndex: 200,
            width: 44, height: 44, borderRadius: '50%',
            background: '#3182ce', color: '#fff', border: 'none',
            fontSize: 20, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="맨 위로"
        >↑</button>
      )}
    </div>
  );
}
