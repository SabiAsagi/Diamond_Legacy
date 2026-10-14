import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Trophy, Home } from 'lucide-react';
import '../index.css';

const Sidebar = () => (
  <aside className="sidebar">
    <div className="sidebar-header">
      <Trophy size={32} color="var(--accent)" />
      Diamond GM
    </div>
    <nav className="nav-links">
      <NavLink to="/management" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <LayoutDashboard size={20} />
        대시보드
      </NavLink>
      <NavLink to="/management/roster" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <Users size={20} />
        선수단 관리
      </NavLink>
      <NavLink to="/management/league" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <Trophy size={20} />
        리그 순위
      </NavLink>
      <div style={{ flex: 1 }}></div>
      <NavLink to="/" className="nav-item" style={{ marginTop: 'auto', marginBottom: '16px' }}>
        <Home size={20} />
        타이틀 화면
      </NavLink>
    </nav>
  </aside>
);

export default function MainLayout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
