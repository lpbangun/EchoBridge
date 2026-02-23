import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import NewSession from '../../pages/NewSession';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../lib/api', () => ({
  createSession: vi.fn(),
  getSettings: vi.fn(),
  createRoom: vi.fn(),
  uploadAudio: vi.fn(),
}));

vi.mock('../../components/ContextSelector', () => ({
  default: ({ selected, onSelect }) => (
    <div data-testid="context-selector">
      <span data-testid="selected-context">{selected}</span>
      <button data-testid="select-class" onClick={() => onSelect('class_lecture')}>
        Class Lecture
      </button>
    </div>
  ),
}));

vi.mock('../../components/FileUploader', () => ({
  default: ({ sessionId, onComplete, onError }) => (
    <div data-testid="file-uploader">Upload for {sessionId}</div>
  ),
}));

import { createSession, getSettings, createRoom } from '../../lib/api';

// --- Helpers ---

const MOCK_SETTINGS = {
  models: [
    'anthropic/claude-sonnet-4-20250514',
    'google/gemini-2.5-flash-preview',
  ],
  default_model: 'anthropic/claude-sonnet-4-20250514',
};

// --- Tests ---

describe('NewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockResolvedValue(MOCK_SETTINGS);
    createSession.mockResolvedValue({ id: 'new-sess-1' });
    createRoom.mockResolvedValue({ code: 'ROOM-5678' });
  });

  it('renders "NEW SESSION" header', async () => {
    render(<NewSession />);
    expect(screen.getByText('NEW SESSION')).toBeInTheDocument();
  });

  it('shows Back button', async () => {
    render(<NewSession />);
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders ContextSelector', async () => {
    render(<NewSession />);
    expect(screen.getByTestId('context-selector')).toBeInTheDocument();
  });

  it('shows Title input', async () => {
    render(<NewSession />);
    expect(screen.getByPlaceholderText('Session title...')).toBeInTheDocument();
  });

  it('shows 3 action buttons (Record Live, Upload File, Create Room)', async () => {
    render(<NewSession />);
    expect(screen.getByText('Record Live')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
    expect(screen.getByText('Create Room')).toBeInTheDocument();
  });

  it('shows model selector with fetched models', async () => {
    render(<NewSession />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('anthropic/claude-sonnet-4-20250514')).toBeInTheDocument();
    });
  });

  it('clicking Back navigates to /', async () => {
    render(<NewSession />);
    fireEvent.click(screen.getByText('Back'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('clicking Record Live creates session and navigates to /recording/:id', async () => {
    render(<NewSession />);
    // Wait for settings to load
    await waitFor(() => {
      expect(getSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Record Live'));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'startup_meeting',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/recording/new-sess-1');
    });
  });

  it('clicking Create Room creates room and navigates to /room/:code', async () => {
    render(<NewSession />);
    await waitFor(() => {
      expect(getSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Create Room'));

    await waitFor(() => {
      expect(createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'startup_meeting',
          host_name: 'Host',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/room/ROOM-5678');
    });
  });

  it('shows error when createSession fails', async () => {
    createSession.mockRejectedValue(new Error('Session creation failed'));
    render(<NewSession />);
    await waitFor(() => {
      expect(getSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Record Live'));

    await waitFor(() => {
      expect(screen.getByText('Session creation failed')).toBeInTheDocument();
    });
  });
});
