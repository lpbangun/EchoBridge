import { contextLabel } from '../lib/utils';

const FILTERS = [
  { id: null, label: 'All' },
  { id: 'class_lecture', label: null },
  { id: 'startup_meeting', label: null },
  { id: 'research_discussion', label: null },
  { id: 'working_session', label: null },
  { id: 'talk_seminar', label: null },
];

export default function SearchBar({ onFilterChange, activeFilter }) {
  return (
    <div className="flex flex-wrap gap-2">
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
            className={isActive ? 'chip-active' : 'chip-inactive'}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
