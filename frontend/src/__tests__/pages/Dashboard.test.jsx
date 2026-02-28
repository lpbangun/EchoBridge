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
  createSession: vi.fn(),
}));

vi.mock('../../lib/offlineStorage', () => ({
  getPendingCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../lib/syncManager', () => ({
  syncPendingRecordings: vi.fn(),
  onSyncStatusChange: vi.fn(() => () => {}),
}));

vi.mock('../../components/AppLayout', () => ({
  useSearch: () => ({ query: '', setQuery: vi.fn() }),
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

  it('shows loading skeleton initially', () => {
    listSessions.mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    // Dashboard shows skeleton cards with animate-pulse
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders metrics row', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });
    expect(screen.getByText('COMPLETE')).toBeInTheDocument();
    expect(screen.getByText('ROOMS')).toBeInTheDocument();
    expect(screen.getByText('THIS WEEK')).toBeInTheDocument();
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
      expect(screen.getByText(/No meetings yet/)).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    listSessions.mockRejectedValue(new Error('Network error'));
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders context filter chips', async () => {
    render(<Dashboard />);
    expect(screen.getByText('All')).toBeInTheDocument();
    // Context filters use contextLabel() from utils
    expect(screen.getByText('Class Lecture')).toBeInTheDocument();
    expect(screen.getByText('Startup Meeting')).toBeInTheDocument();
  });

  it('clicking a session card navigates to session view', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('session-card-sess-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('session-card-sess-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/session/sess-1');
  });
});
