import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Recording from '../../pages/Recording';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'test-session-123' }),
}));

vi.mock('../../lib/api', () => ({
  getSession: vi.fn(),
  submitTranscript: vi.fn(),
}));

vi.mock('../../components/AudioRecorder', () => ({
  default: ({ onTranscriptChunk, onAudioLevel, isRecording, isPaused }) => (
    <div data-testid="audio-recorder" data-recording={isRecording} data-paused={isPaused} />
  ),
}));

import { getSession, submitTranscript } from '../../lib/api';

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
    getSession.mockResolvedValue(MOCK_SESSION);
    submitTranscript.mockResolvedValue({ status: 'ok' });
  });

  it('renders recording status label', () => {
    render(<Recording />);
    expect(screen.getByText('Recording')).toBeInTheDocument();
  });

  it('shows timer display', () => {
    render(<Recording />);
    // Initial timer should show 00:00
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('shows pause and stop buttons', () => {
    render(<Recording />);
    expect(screen.getByText('Pause')).toBeInTheDocument();
    expect(screen.getByText('Stop')).toBeInTheDocument();
  });

  it('renders AudioRecorder component', () => {
    render(<Recording />);
    expect(screen.getByTestId('audio-recorder')).toBeInTheDocument();
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

  it('clicking Stop submits transcript and navigates to /session/:id', async () => {
    render(<Recording />);

    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => {
      expect(submitTranscript).toHaveBeenCalledWith('test-session-123', '', 0);
      expect(mockNavigate).toHaveBeenCalledWith('/session/test-session-123');
    });
  });

  it('shows error when transcript submission fails', async () => {
    submitTranscript.mockRejectedValue(new Error('Submission failed'));
    render(<Recording />);

    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => {
      expect(screen.getByText('Submission failed')).toBeInTheDocument();
    });
  });

  it('toggles pause/resume on pause button click', () => {
    render(<Recording />);
    const pauseBtn = screen.getByText('Pause');
    fireEvent.click(pauseBtn);

    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});
