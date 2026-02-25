import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getSettings, updateSettings } from './lib/api';
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
import OfflineBanner from './components/OfflineBanner';
import InstallPrompt from './components/InstallPrompt';
import SetupWizard from './components/SetupWizard';
import WelcomeLanding from './components/WelcomeLanding';
import { initSyncManager } from './lib/syncManager';

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
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
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewSession />} />
        <Route path="/recording/:sessionId" element={<Recording />} />
        <Route path="/session/:id" element={<SessionView />} />
        <Route path="/room/:code" element={<RoomView />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/series/:id" element={<SeriesView />} />
        <Route path="/ask" element={<AskPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallPrompt />
    </BrowserRouter>
  );
}
