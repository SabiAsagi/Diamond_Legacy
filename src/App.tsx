import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { initDummyDataIfNeeded } from './db';
import TitleScreen from './pages/TitleScreen';
import MainLayout from './layouts/MainLayout';
import PlayerCreation from './pages/development/PlayerCreation';
import CoachInterview from './pages/development/CoachInterview';
import DevelopmentDashboard from './pages/development/DevelopmentDashboard';
import ManagementDashboard from './pages/management/ManagementDashboard';
import ManagementRoster from './pages/management/ManagementRoster';
import ManagementLeague from './pages/management/ManagementLeague';
import ManagementOffice from './pages/management/ManagementOffice';

export default function App() {
  useEffect(() => {
    void initDummyDataIfNeeded().catch(() => { /* 시작 화면에서 IndexedDB 로드 오류와 재시도를 안내한다. */ });
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<TitleScreen />} />

        {/* 선수 육성 모드 */}
        <Route path="/development/create" element={<PlayerCreation />} />
        <Route path="/development/interview/:id" element={<CoachInterview />} />
        <Route path="/development/dashboard/:id" element={<DevelopmentDashboard />} />

        {/* 구단 운영 모드 */}
        <Route path="/management" element={<MainLayout />}>
          <Route index element={<ManagementDashboard />} />
          <Route path="roster" element={<ManagementRoster />} />
          <Route path="league" element={<ManagementLeague />} />
          <Route path="office" element={<ManagementOffice />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
