import { Search } from 'lucide-react';
import { contextLabel } from '../lib/utils';

/**
 * Search input with context filter chips below.
 * Glassmorphism dark theme: glass-input for search, translucent chips with indigo accent.
 */

const FILTERS = [
  { id: null, label: 'All' },
  { id: 'class_lecture', label: null },
  { id: 'startup_meeting', label: null },
  { id: 'research_discussion', label: null },
  { id: 'working_session', label: null },
  { id: 'talk_seminar', label: null },
];

export default function SearchBar({ onSearch, onFilterChange, activeFilter }) {
  return (
    <div>
      {/* Search input */}
      <div className="relative">
        <Search
          size={20}
          strokeWidth={1.5}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          type="text"
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search sessions..."
          className="w-full text-base glass-input pl-12 pr-4 py-3"
        />
      </div>

      {/* Filter chips */}
      <div className="mt-4 flex flex-wrap gap-2 overflow-x-auto">
        {FILTERS.map((filter) => {
          const isActive =
            filter.id === activeFilter ||
            (filter.id === null && (activeFilter === null || activeFilter === undefined));
          const label = filter.label || contextLabel(filter.id);

          return (
            <button
              key={filter.id || 'all'}
              type="button"
              onClick={() => onFilterChange(filter.id)}
              className={`inline-block text-xs font-medium tracking-wide px-3 py-1.5 rounded-full transition-all duration-200 touch-target whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-500/20 border border-indigo-400/50 text-indigo-300'
                  : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
