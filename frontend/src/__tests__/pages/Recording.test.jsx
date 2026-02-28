import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import Recording from '../../pages/Recording';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'test-session-123' }),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('../../lib/api', () => ({
  getSession: vi.fn(),
  submitTranscript: vi.fn(),
  updateSession: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../lib/offlineStorage', () => ({
  savePendingRecording: vi.fn(),
}));

// Capture the onChunk callback so tests can inject transcript text
let capturedOnChunk = null;
vi.mock('../../lib/speechRecognition', () => ({
  createSpeechRecognition: vi.fn((opts) => {
    capturedOnChunk = opts?.onChunk || null;
    return {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
  }),
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  default: () => true,
}));

vi.mock('../../components/LiveTranscript', () => ({
  default: ({ chunks }) => <div data-testid="live-transcript">{chunks?.length || 0} chunks</div>,
}));

import { getSession, submitTranscript } from '../../lib/api';

// Mock getUserMedia to prevent errors during mount
Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockRejectedValue(new Error('Not available in test')),
  },
  writable: true,
});

// --- Helpers ---

const MOCK_SESSION = {
  id: 'test-session-123',
  title: 'Team Sync',
  context: 'startup_meeting',
  status: 'recording',
  created_at: '2026-02-22T10:00:00Z',
};

// --- Tests ---

describe('Recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnChunk = null;
    getSession.mockResolvedValue(MOCK_SESSION);
    submitTranscript.mockResolvedValue({ status: 'ok' });
  });

  it('renders recording status label', () => {
    render(<Recording />);
    expect(screen.getByText('Recording')).toBeInTheDocument();
  });

  it('shows timer display', () => {
    render(<Recording />);
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('shows pause and stop buttons after recording starts', async () => {
    render(<Recording />);
    await waitFor(() => {
      expect(screen.getByText('Pause')).toBeInTheDocument();
    });
    expect(screen.getByText('Stop')).toBeInTheDocument();
  });

  it('fetches session info on mount', async () => {
    render(<Recording />);
    await waitFor(() => {
      expect(getSession).toHaveBeenCalledWith('test-session-123');
    });
  });

  it('shows session metadata after loading', async () => {
    render(<Recording />);
    await waitFor(() => {
      expect(screen.getByText('Startup Meeting')).toBeInTheDocument();
    });
    expect(screen.getByText('Team Sync')).toBeInTheDocument();
  });

  it('clicking Stop with empty transcript shows no-speech error', async () => {
    render(<Recording />);
    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => {
      expect(screen.getByText(/No speech detected/)).toBeInTheDocument();
    });
  });

  it('clicking Stop with transcript submits and navigates', async () => {
    render(<Recording />);

    // Wait for recording to start and inject transcript text
    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeInTheDocument();
      expect(capturedOnChunk).not.toBeNull();
    });
    act(() => {
      capturedOnChunk({ text: 'Hello world', isFinal: true, timestampMs: 1000 });
    });

    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => {
      expect(submitTranscript).toHaveBeenCalledWith('test-session-123', expect.stringContaining('Hello world'), expect.any(Number), false);
      expect(mockNavigate).toHaveBeenCalledWith('/session/test-session-123');
    });
  });

  it('shows error when transcript submission fails', async () => {
    submitTranscript.mockRejectedValue(new Error('Submission failed'));
    render(<Recording />);

    // Wait for recording to start and inject transcript text
    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeInTheDocument();
      expect(capturedOnChunk).not.toBeNull();
    });
    act(() => {
      capturedOnChunk({ text: 'Some transcript text', isFinal: true, timestampMs: 1000 });
    });

    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => {
      expect(screen.getByText('Submission failed')).toBeInTheDocument();
    });
  });

  it('toggles pause/resume on pause button click', async () => {
    render(<Recording />);
    await waitFor(() => {
      expect(screen.getByText('Pause')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Pause'));

    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});
