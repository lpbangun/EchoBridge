import { BookOpen, Rocket, FlaskConical, Lightbulb, Mic } from 'lucide-react';

/**
 * Grid of 5 session type cards for selecting a context.
 * Layout: grid-cols-3 gap-4 (3 on first row, 2 on second).
 * Dark zinc/lime design: card components with accent on selection.
 */

const CONTEXTS = [
  {
    id: 'class_lecture',
    label: 'Class Lecture',
    description: 'Lectures, seminars, academic sessions',
    Icon: BookOpen,
  },
  {
    id: 'startup_meeting',
    label: 'Startup Meeting',
    description: 'Team syncs, standups, strategy',
    Icon: Rocket,
  },
  {
    id: 'research_discussion',
    label: 'Research Discussion',
    description: 'Lab meetings, paper reviews, methodology',
    Icon: FlaskConical,
  },
  {
    id: 'working_session',
    label: 'Working Session',
    description: 'Brainstorms, workshops, ideation',
    Icon: Lightbulb,
  },
  {
    id: 'talk_seminar',
    label: 'Talk / Seminar',
    description: 'Keynotes, panels, presentations',
    Icon: Mic,
  },
];

export default function ContextSelector({ selected, onSelect }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
      {CONTEXTS.map((ctx) => {
        const isSelected = selected === ctx.id;
        return (
          <button
            key={ctx.id}
            type="button"
            onClick={() => onSelect(ctx.id)}
            className={`card p-4 md:p-5 text-left transition-all duration-200 touch-target ${
              isSelected
                ? 'border-accent-border bg-accent-muted shadow-glow'
                : 'border-border hover:bg-zinc-800 hover:border-border-hover'
            }`}
          >
            <ctx.Icon
              size={20}
              strokeWidth={1.5}
              className={isSelected ? 'text-accent' : 'text-zinc-400'}
            />
            <span
              className={`block mt-2 text-xs font-medium tracking-widest uppercase ${
                isSelected ? 'text-white' : 'text-zinc-300'
              }`}
            >
              {ctx.label}
            </span>
            <span className="block mt-1 text-xs text-zinc-400">
              {ctx.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
