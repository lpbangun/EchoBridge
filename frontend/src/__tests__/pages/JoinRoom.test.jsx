import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import JoinRoom from '../../pages/JoinRoom';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

vi.mock('../../lib/api', () => ({
  joinRoom: vi.fn(),
}));

import { joinRoom } from '../../lib/api';

// --- Tests ---

describe('JoinRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    joinRoom.mockResolvedValue({ code: 'ROOM-5678' });
  });

  it('renders "JOIN ROOM" header', () => {
    render(<JoinRoom />);
    expect(screen.getByText('JOIN ROOM')).toBeInTheDocument();
  });

  it('shows room code and name inputs', () => {
    render(<JoinRoom />);
    expect(screen.getByPlaceholderText('ROOM-0000')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Alice')).toBeInTheDocument();
  });

  it('shows "Join Room" button', () => {
    render(<JoinRoom />);
    expect(screen.getByText('Join Room')).toBeInTheDocument();
  });

  it('shows error when code is empty on submit', async () => {
    render(<JoinRoom />);
    // Leave code empty, fill in name
    fireEvent.change(screen.getByPlaceholderText('Alice'), {
      target: { value: 'Bob' },
    });
    fireEvent.submit(screen.getByText('Join Room'));

    await waitFor(() => {
      expect(screen.getByText('Room code is required.')).toBeInTheDocument();
    });
  });

  it('shows error when name is empty on submit', async () => {
    render(<JoinRoom />);
    // Fill in code, leave name empty
    fireEvent.change(screen.getByPlaceholderText('ROOM-0000'), {
      target: { value: 'ROOM-9999' },
    });
    fireEvent.submit(screen.getByText('Join Room'));

    await waitFor(() => {
      expect(screen.getByText('Your name is required.')).toBeInTheDocument();
    });
  });

  it('uppercases room code input', () => {
    render(<JoinRoom />);
    const input = screen.getByPlaceholderText('ROOM-0000');
    fireEvent.change(input, { target: { value: 'room-abcd' } });
    expect(input.value).toBe('ROOM-ABCD');
  });

  it('successful join navigates to /room/:CODE', async () => {
    render(<JoinRoom />);

    fireEvent.change(screen.getByPlaceholderText('ROOM-0000'), {
      target: { value: 'ROOM-5678' },
    });
    fireEvent.change(screen.getByPlaceholderText('Alice'), {
      target: { value: 'Charlie' },
    });
    fireEvent.submit(screen.getByText('Join Room'));

    await waitFor(() => {
      expect(joinRoom).toHaveBeenCalledWith({
        code: 'ROOM-5678',
        name: 'Charlie',
        type: 'human',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/room/ROOM-5678');
    });
  });

  it('shows error when joinRoom API fails', async () => {
    joinRoom.mockRejectedValue(new Error('Invalid room code'));
    render(<JoinRoom />);

    fireEvent.change(screen.getByPlaceholderText('ROOM-0000'), {
      target: { value: 'ROOM-0000' },
    });
    fireEvent.change(screen.getByPlaceholderText('Alice'), {
      target: { value: 'Dan' },
    });
    fireEvent.submit(screen.getByText('Join Room'));

    await waitFor(() => {
      expect(screen.getByText('Invalid room code')).toBeInTheDocument();
    });
  });
});
