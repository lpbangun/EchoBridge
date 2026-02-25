import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getSettings, updateSettings } from './lib/api';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import NewSession from './pages/NewSession';
import Recording from './pages/Recording';
import SessionView from './pages/SessionView';
import RoomView from './pages/RoomView';
import JoinRoom from './pages/JoinRoom';
import SettingsPage from './pages/SettingsPage';
import SeriesView from './pages/SeriesView';
import AskPage from './pages/AskPage';
import GuidePage from './pages/GuidePage';
import RecordingsPage from './pages/RecordingsPage';
import SeriesListPage from './pages/SeriesListPage';
import RoomsPage from './pages/RoomsPage';
import AgentMeetingCreate from './pages/AgentMeetingCreate';
import AgentMeetingView from './pages/AgentMeetingView';
import OfflineBanner from './components/OfflineBanner';
import InstallPrompt from './components/InstallPrompt';
import SetupWizard from './components/SetupWizard';
import WelcomeLanding from './components/WelcomeLanding';
import { initSyncManager } from './lib/syncManager';

function LayoutRoute({ children }) {
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  const [showLanding, setShowLanding] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    initSyncManager();
  }, []);

  useEffect(() => {
    getSettings()
      .then((settings) => {
        const hasAnyKey =
          settings.openrouter_api_key_set ||
          settings.openai_api_key_set ||
          settings.anthropic_api_key_set ||
          settings.google_api_key_set ||
          settings.xai_api_key_set;
        const isNewUser = !settings.onboarding_complete && !hasAnyKey;
        setShowLanding(isNewUser);
        setShowWizard(!isNewUser && !hasAnyKey);
        setSettingsLoaded(true);
      })
      .catch(() => {
        setSettingsLoaded(true);
      });
  }, []);

  async function markComplete() {
    await updateSettings({ onboarding_complete: true });
    setShowLanding(false);
    setShowWizard(false);
  }

  if (!settingsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-darker">
        <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (showLanding) {
    return (
      <WelcomeLanding
        onGetStarted={() => { setShowLanding(false); setShowWizard(true); }}
        onSkip={markComplete}
      />
    );
  }

  if (showWizard) {
    return <SetupWizard onComplete={markComplete} />;
  }

  return (
    <BrowserRouter>
      <OfflineBanner />
      <Routes>
        {/* Full-screen routes (no sidebar) */}
        <Route path="/recording/:sessionId" element={<Recording />} />

        {/* Layout routes (sidebar + top bar) */}
        <Route path="/" element={<LayoutRoute><Dashboard /></LayoutRoute>} />
        <Route path="/new" element={<LayoutRoute><NewSession /></LayoutRoute>} />
        <Route path="/session/:id" element={<LayoutRoute><SessionView /></LayoutRoute>} />
        <Route path="/room/:code" element={<LayoutRoute><RoomView /></LayoutRoute>} />
        <Route path="/join" element={<LayoutRoute><JoinRoom /></LayoutRoute>} />
        <Route path="/recordings" element={<LayoutRoute><RecordingsPage /></LayoutRoute>} />
        <Route path="/series" element={<LayoutRoute><SeriesListPage /></LayoutRoute>} />
        <Route path="/series/:id" element={<LayoutRoute><SeriesView /></LayoutRoute>} />
        <Route path="/rooms" element={<LayoutRoute><RoomsPage /></LayoutRoute>} />
        <Route path="/meeting/new" element={<LayoutRoute><AgentMeetingCreate /></LayoutRoute>} />
        <Route path="/meeting/:code" element={<LayoutRoute><AgentMeetingView /></LayoutRoute>} />
        <Route path="/ask" element={<LayoutRoute><AskPage /></LayoutRoute>} />
        <Route path="/guide" element={<LayoutRoute><GuidePage /></LayoutRoute>} />
        <Route path="/settings" element={<LayoutRoute><SettingsPage /></LayoutRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallPrompt />
    </BrowserRouter>
  );
}
