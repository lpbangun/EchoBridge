import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Mic, Folder, Users, MessageSquare, Settings, BookOpen } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/recordings', icon: Mic, label: 'Recordings' },
  { path: '/series', icon: Folder, label: 'Series' },
  { path: '/rooms', icon: Users, label: 'Rooms' },
  { path: '/ask', icon: MessageSquare, label: 'Ask' },
];

const BOTTOM_ITEMS = [
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/guide', icon: BookOpen, label: 'Guide' },
];

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleNav(path) {
    navigate(path);
    onClose?.();
  }

  function isActive(path) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[220px] bg-surface-dark border-r border-border flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <button onClick={() => handleNav('/')} className="px-5 py-5 flex items-center gap-3 w-full text-left">
          <div className="w-8 h-8 rounded-[8px] bg-accent flex items-center justify-center">
            <span className="text-zinc-900 font-display font-extrabold text-sm">E</span>
          </div>
          <span className="font-display font-bold text-[15px] text-white tracking-tight">
            EchoBridge
          </span>
        </button>

        {/* Main nav */}
        <nav className="flex-1 px-3 mt-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-[10px] transition-colors text-left ${
                  active
                    ? 'bg-[#C4F82A14] text-accent font-semibold'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 font-medium'
                }`}
              >
                <item.icon size={16} strokeWidth={active ? 2 : 1.5} className={active ? 'text-accent' : 'text-zinc-500'} />
                <span className="text-[13px] font-sans">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 pb-4 space-y-1 border-t border-border pt-3 mt-2">
          {BOTTOM_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-[10px] transition-colors text-left ${
                  active
                    ? 'bg-[#C4F82A14] text-accent font-semibold'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 font-medium'
                }`}
              >
                <item.icon size={16} strokeWidth={active ? 2 : 1.5} className={active ? 'text-accent' : 'text-zinc-500'} />
                <span className="text-[13px] font-sans">{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
