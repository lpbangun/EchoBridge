import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SessionView from '../../pages/SessionView';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'test-session-123' }),
}));

vi.mock('../../lib/api', () => ({
  getSession: vi.fn(),
  getInterpretations: vi.fn(),
  interpretSession: vi.fn(),
  exportMarkdown: vi.fn(),
  updateSession: vi.fn(),
  listSeries: vi.fn().mockResolvedValue([]),
  addSessionToSeries: vi.fn(),
}));

vi.mock('../../components/MarkdownPreview', () => ({
  default: ({ content }) => <div data-testid="markdown-preview">{content}</div>,
}));

vi.mock('../../components/InterpretationCard', () => ({
  default: ({ interpretation }) => (
    <div data-testid={`interp-card-${interpretation.id}`}>{interpretation.lens_type}</div>
  ),
}));

vi.mock('../../components/SocketSelector', () => ({
  default: ({ value, onSelect }) => (
    <div data-testid="socket-selector">
      <button
        data-testid="select-lens"
        onClick={() => onSelect({ lens_type: 'preset', lens_id: 'meeting_notes' })}
      >
        Select Lens
      </button>
    </div>
  ),
}));

import { getSession, getInterpretations } from '../../lib/api';

// --- Helpers ---

const MOCK_SESSION = {
  id: 'test-session-123',
  title: 'Sprint Planning',
  context: 'startup_meeting',
  status: 'complete',
  created_at: '2026-02-20T10:00:00Z',
  duration_seconds: 2400,
  transcript: 'Alice: We should prioritize the auth module.\nBob: Agreed, let us start there.',
  tags: ['planning', 'sprint'],
};

const MOCK_SESSION_NO_TITLE = {
  ...MOCK_SESSION,
  title: null,
};

const MOCK_SESSION_NO_TRANSCRIPT = {
  ...MOCK_SESSION,
  transcript: null,
};

const MOCK_INTERPRETATIONS = [
  {
    id: 'interp-1',
    lens_type: 'meeting_notes',
    is_primary: true,
    output_markdown: '## Meeting Notes\n\n- Prioritize auth module',
    created_at: '2026-02-20T11:00:00Z',
  },
  {
    id: 'interp-2',
    lens_type: 'action_items',
    is_primary: false,
    output_markdown: '## Action Items\n\n- Start auth module',
    created_at: '2026-02-20T11:05:00Z',
  },
];

// --- Tests ---

describe('SessionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(MOCK_SESSION);
    getInterpretations.mockResolvedValue(MOCK_INTERPRETATIONS);
  });

  it('shows loading state initially', () => {
    getSession.mockReturnValue(new Promise(() => {}));
    getInterpretations.mockReturnValue(new Promise(() => {}));
    render(<SessionView />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders session title after loading', async () => {
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
    });
  });

  it('shows "Untitled Session" for null title', async () => {
    getSession.mockResolvedValue(MOCK_SESSION_NO_TITLE);
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByText('Untitled Session')).toBeInTheDocument();
    });
  });

  it('renders 3 tab buttons (Summary, Transcript, Interpretations)', async () => {
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument();
    });
    expect(screen.getByText('Transcript')).toBeInTheDocument();
    // Interpretations tab includes count
    expect(screen.getByText('Interpretations (2)')).toBeInTheDocument();
  });

  it('Summary tab shows context label and status', async () => {
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByText('Startup Meeting')).toBeInTheDocument();
    });
    expect(screen.getByText('complete')).toBeInTheDocument();
  });

  it('Summary tab shows primary interpretation content', async () => {
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    });
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Meeting Notes');
  });

  it('Transcript tab shows transcript text', async () => {
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Transcript'));

    expect(screen.getByText(/Alice: We should prioritize the auth module/)).toBeInTheDocument();
  });

  it('Transcript tab shows "No transcript available." when empty', async () => {
    getSession.mockResolvedValue(MOCK_SESSION_NO_TRANSCRIPT);
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Transcript'));

    expect(screen.getByText('No transcript available.')).toBeInTheDocument();
  });

  it('clicking Back navigates to /', async () => {
    render(<SessionView />);
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Back'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows error state when API fails', async () => {
    getSession.mockRejectedValue(new Error('Server is down'));
    getInterpretations.mockRejectedValue(new Error('Server is down'));
    render(<SessionView />);

    await waitFor(() => {
      expect(screen.getByText('Server is down')).toBeInTheDocument();
    });
  });
});
