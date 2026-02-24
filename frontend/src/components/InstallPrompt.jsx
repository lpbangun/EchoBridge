import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

/**
 * "Add to Home Screen" install prompt.
 * Captures the beforeinstallprompt event and shows a dismissible banner.
 * Only appears when the app is installable (not already installed).
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed
    const wasDismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }

    function handleAppInstalled() {
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  }

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 glass rounded-xl p-4 flex items-center gap-3 shadow-lg shadow-black/20 safe-area-inset">
      <Download size={20} strokeWidth={1.5} className="text-orange-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200">Install EchoBridge</p>
        <p className="text-xs text-slate-400 mt-0.5">Add to your home screen for quick access.</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleInstall}
          className="btn-primary text-xs px-3 py-1.5"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-slate-300 transition-colors touch-target inline-flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
