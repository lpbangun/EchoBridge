import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RoomView from '../../pages/RoomView';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ code: 'ROOM-1234' }),
}));

vi.mock('../../lib/api', () => ({
  getRoom: vi.fn(),
  startRoom: vi.fn(),
  stopRoom: vi.fn(),
  kickAgent: vi.fn(),
  getSettings: vi.fn().mockResolvedValue({ user_display_name: '' }),
}));

vi.mock('../../lib/websocket', () => ({
  createWebSocket: vi.fn(() => ({
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  })),
}));

vi.mock('../../components/LiveTranscript', () => ({
  default: ({ chunks }) => (
    <div data-testid="live-transcript">{chunks.length} chunks</div>
  ),
}));

vi.mock('../../components/ParticipantList', () => ({
  default: ({ participants, hostName }) => (
    <div data-testid="participant-list">
      {participants.map((p) => (
        <span key={p.name}>{p.name}</span>
      ))}
    </div>
  ),
}));

import { getRoom, startRoom, stopRoom } from '../../lib/api';

// --- Helpers ---

const MOCK_ROOM_WAITING = {
  code: 'ROOM-1234',
  status: 'waiting',
  host_name: 'Alice',
  participants: [
    { name: 'Alice', participant_type: 'human' },
    { name: 'Bob', participant_type: 'human' },
  ],
  session_id: null,
};

const MOCK_ROOM_RECORDING = {
  ...MOCK_ROOM_WAITING,
  status: 'recording',
};

// --- Tests ---

describe('RoomView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRoom.mockResolvedValue(MOCK_ROOM_WAITING);
    startRoom.mockResolvedValue(MOCK_ROOM_RECORDING);
    stopRoom.mockResolvedValue({ ...MOCK_ROOM_WAITING, status: 'closed', session_id: 'sess-abc' });
  });

  it('shows loading state initially', () => {
    getRoom.mockReturnValue(new Promise(() => {}));
    render(<RoomView />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders room code "ROOM-1234" after loading', async () => {
    render(<RoomView />);
    await waitFor(() => {
      expect(screen.getByText('ROOM-1234')).toBeInTheDocument();
    });
  });

  it('shows room status', async () => {
    render(<RoomView />);
    await waitFor(() => {
      expect(screen.getByText('waiting')).toBeInTheDocument();
    });
  });

  it('shows host name', async () => {
    render(<RoomView />);
    await waitFor(() => {
      // "Alice" appears in both Host section and ParticipantList mock,
      // so we verify the Host label exists and that "Alice" appears at least once.
      expect(screen.getByText('Host')).toBeInTheDocument();
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "Start Recording" button when status is "waiting"', async () => {
    render(<RoomView />);
    await waitFor(() => {
      expect(screen.getByText('Start Recording')).toBeInTheDocument();
    });
  });

  it('shows "Stop Recording" button when status is "recording"', async () => {
    getRoom.mockResolvedValue(MOCK_ROOM_RECORDING);
    render(<RoomView />);
    await waitFor(() => {
      expect(screen.getByText('Stop Recording')).toBeInTheDocument();
    });
  });

  it('shows error state when getRoom fails', async () => {
    getRoom.mockRejectedValue(new Error('Room not found'));
    render(<RoomView />);

    await waitFor(() => {
      expect(screen.getByText('Room not found')).toBeInTheDocument();
    });
  });

  it('renders participant list', async () => {
    render(<RoomView />);
    await waitFor(() => {
      expect(screen.getByTestId('participant-list')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders live transcript area', async () => {
    render(<RoomView />);
    await waitFor(() => {
      expect(screen.getByTestId('live-transcript')).toBeInTheDocument();
    });
  });
});
