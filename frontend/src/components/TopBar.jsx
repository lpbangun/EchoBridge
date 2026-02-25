import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Upload, Mic, Menu } from 'lucide-react';
import { createSession } from '../lib/api';

export default function TopBar({ onMenuToggle, searchQuery, onSearchChange }) {
  const navigate = useNavigate();
  const [localQuery, setLocalQuery] = useState(searchQuery || '');
  const debounceRef = useRef(null);

  useEffect(() => {
    setLocalQuery(searchQuery || '');
  }, [searchQuery]);

  function handleInputChange(e) {
    const val = e.target.value;
    setLocalQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange?.(val);
    }, 300);
  }

  return (
    <div className="border-b border-border px-4 lg:px-10 py-3 flex items-center justify-between gap-4">
      {/* Left: hamburger + search */}
      <div className="flex items-center gap-3 flex-1">
        <button
          onClick={onMenuToggle}
          className="lg:hidden text-zinc-400 hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>
        <div className="relative w-full max-w-[280px]">
          <Search
            size={16}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="text"
            value={localQuery}
            onChange={handleInputChange}
            placeholder="Search sessions..."
            className="w-full eb-input pl-9 pr-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/new')}
          className="btn-secondary inline-flex items-center gap-2 text-sm"
        >
          <Upload size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Upload</span>
        </button>
        <button
          onClick={() => {
            createSession({ context: 'working_session' }).then((session) => {
              navigate(`/recording/${session.id}`);
            });
          }}
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          <Mic size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Record</span>
        </button>
      </div>
    </div>
  );
}
