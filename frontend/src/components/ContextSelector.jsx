import { BookOpen, Rocket, FlaskConical, Lightbulb, Mic } from 'lucide-react';

/**
 * Grid of 5 session type cards for selecting a context.
 * Layout: grid-cols-3 gap-4 (3 on first row, 2 on second).
 * Selected state: border-neutral-900, bg-neutral-50.
 * Unselected: border-neutral-200.
 * No rounded corners, no shadows per DESIGN.md.
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
    <div className="grid grid-cols-3 gap-4">
      {CONTEXTS.map((ctx) => {
        const isSelected = selected === ctx.id;
        return (
          <button
            key={ctx.id}
            type="button"
            onClick={() => onSelect(ctx.id)}
            className={`p-4 text-left border transition-colors ${
              isSelected
                ? 'border-neutral-900 bg-neutral-50'
                : 'border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <ctx.Icon
              size={20}
              strokeWidth={1.5}
              className={isSelected ? 'text-neutral-900' : 'text-neutral-500'}
            />
            <span className="block mt-2 text-xs font-medium tracking-widest uppercase text-neutral-900">
              {ctx.label}
            </span>
            <span className="block mt-1 text-xs text-neutral-500">
              {ctx.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
