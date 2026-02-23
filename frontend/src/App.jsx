import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewSession from './pages/NewSession';
import Recording from './pages/Recording';
import SessionView from './pages/SessionView';
import RoomView from './pages/RoomView';
import JoinRoom from './pages/JoinRoom';
import SettingsPage from './pages/SettingsPage';
import SeriesView from './pages/SeriesView';
import OfflineBanner from './components/OfflineBanner';
import InstallPrompt from './components/InstallPrompt';
import { initSyncManager } from './lib/syncManager';

export default function App() {
  useEffect(() => {
    initSyncManager();
  }, []);

  return (
    <BrowserRouter>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewSession />} />
        <Route path="/recording/:sessionId" element={<Recording />} />
        <Route path="/session/:id" element={<SessionView />} />
        <Route path="/room/:code" element={<RoomView />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/series/:id" element={<SeriesView />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallPrompt />
    </BrowserRouter>
  );
}
