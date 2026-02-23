import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Dashboard from '../../pages/Dashboard';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../lib/api', () => ({
  listSessions: vi.fn(),
  searchSessions: vi.fn(),
  getSettings: vi.fn().mockResolvedValue({ openrouter_api_key_set: true }),
  listSeries: vi.fn().mockResolvedValue([]),
}));

// Mock child components that are not under test
vi.mock('../../components/SearchBar', () => ({
  default: ({ onSearch, onFilterChange, activeFilter }) => (
    <div>
      <input
        data-testid="search-bar"
        onChange={(e) => onSearch && onSearch(e.target.value)}
        placeholder="Search sessions..."
      />
      <div>
        <button onClick={() => onFilterChange && onFilterChange(null)}>All</button>
        <button onClick={() => onFilterChange && onFilterChange('class_lecture')}>Class Lecture</button>
        <button onClick={() => onFilterChange && onFilterChange('startup_meeting')}>Startup Meeting</button>
        <button onClick={() => onFilterChange && onFilterChange('research_discussion')}>Research</button>
        <button onClick={() => onFilterChange && onFilterChange('working_session')}>Working Session</button>
        <button onClick={() => onFilterChange && onFilterChange('talk_seminar')}>Talk / Seminar</button>
      </div>
    </div>
  ),
}));

vi.mock('../../components/SessionCard', () => ({
  default: ({ session, onClick }) => (
    <button data-testid={`session-card-${session.id}`} onClick={() => onClick(session.id)}>
      {session.title || 'Untitled Session'}
    </button>
  ),
}));

import { listSessions, searchSessions } from '../../lib/api';

// --- Helpers ---

const MOCK_SESSIONS = [
  {
    id: 'sess-1',
    title: 'Team Standup',
    context: 'startup_meeting',
    status: 'complete',
    created_at: '2026-02-20T10:00:00Z',
    duration_seconds: 1800,
  },
  {
    id: 'sess-2',
    title: 'Physics Lecture',
    context: 'class_lecture',
    status: 'complete',
    created_at: '2026-02-19T14:00:00Z',
    duration_seconds: 3600,
  },
];

// --- Tests ---

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSessions.mockResolvedValue(MOCK_SESSIONS);
    searchSessions.mockResolvedValue([]);
  });

  it('shows loading state initially', () => {
    // Make the API hang so we can observe loading
    listSessions.mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders "ECHOBRIDGE" header', async () => {
    render(<Dashboard />);
    expect(screen.getByText('ECHOBRIDGE')).toBeInTheDocument();
  });

  it('shows "New" button', async () => {
    render(<Dashboard />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows settings button with aria-label', async () => {
    render(<Dashboard />);
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('renders session cards after loading', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('session-card-sess-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-card-sess-2')).toBeInTheDocument();
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
    expect(screen.getByText('Physics Lecture')).toBeInTheDocument();
  });

  it('shows empty state when no sessions', async () => {
    listSessions.mockResolvedValue([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    listSessions.mockRejectedValue(new Error('Network error'));
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('clicking "New" navigates to /new', async () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByText('New'));
    expect(mockNavigate).toHaveBeenCalledWith('/new');
  });

  it('clicking settings navigates to /settings', async () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('renders context filter chips', async () => {
    render(<Dashboard />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Class Lecture')).toBeInTheDocument();
    expect(screen.getByText('Startup Meeting')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Working Session')).toBeInTheDocument();
    expect(screen.getByText('Talk / Seminar')).toBeInTheDocument();
  });
});
