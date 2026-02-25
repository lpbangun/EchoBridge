import { WifiOff } from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus';

/**
 * Shows a banner when the user is offline.
 * Appears at the top of the viewport with a smooth transition.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-zinc-900 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 safe-area-inset">
      <WifiOff size={16} strokeWidth={2} />
      <span>You're offline. Recordings will sync when you reconnect.</span>
    </div>
  );
}
