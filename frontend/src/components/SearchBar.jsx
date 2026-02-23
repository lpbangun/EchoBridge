import { Search } from 'lucide-react';
import { contextLabel } from '../lib/utils';

/**
 * Search input with context filter chips below.
 * Input: no border-radius, focus border-neutral-900 per DESIGN.md.
 * Chips: no border-radius, no background color, border only per DESIGN.md tags/chips spec.
 * Active chip: border-neutral-900.
 * Inactive chip: border-neutral-200.
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
          className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="text"
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search sessions..."
          className="w-full text-base pl-12 pr-4 py-3 border border-neutral-200 bg-white placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none transition-colors"
        />
      </div>

      {/* Filter chips */}
      <div className="mt-4 flex flex-wrap gap-2">
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
              className={`inline-block text-xs font-medium tracking-wide px-2.5 py-1 border transition-colors ${
                isActive
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
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
