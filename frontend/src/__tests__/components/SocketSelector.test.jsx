import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/api', () => ({
  listSockets: vi.fn(),
  listLenses: vi.fn(),
}));

import { listSockets, listLenses } from '../../lib/api';
import SocketSelector from '../../components/SocketSelector';

describe('SocketSelector', () => {
  const onSelect = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Loading..." initially', () => {
    listLenses.mockReturnValue(new Promise(() => {}));
    listSockets.mockReturnValue(new Promise(() => {}));

    render(<SocketSelector onSelect={onSelect} value={null} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders preset lenses after loading', async () => {
    listLenses.mockResolvedValue([
      { id: 'action_items', name: 'Action Items' },
      { id: 'summary', name: 'Summary' },
    ]);
    listSockets.mockResolvedValue([]);

    render(<SocketSelector onSelect={onSelect} value={null} />);

    expect(await screen.findByText('Action Items')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Preset Lenses')).toBeInTheDocument();
  });

  it('renders sockets after loading', async () => {
    listLenses.mockResolvedValue([]);
    listSockets.mockResolvedValue([
      { id: 'sock-1', name: 'Custom Socket', description: 'My custom socket' },
    ]);

    render(<SocketSelector onSelect={onSelect} value={null} />);

    expect(await screen.findByText('Custom Socket')).toBeInTheDocument();
    expect(screen.getByText('My custom socket')).toBeInTheDocument();
    expect(screen.getByText('Sockets')).toBeInTheDocument();
  });

  it('clicking a lens calls onSelect with preset lens_type', async () => {
    listLenses.mockResolvedValue([
      { id: 'action_items', name: 'Action Items' },
    ]);
    listSockets.mockResolvedValue([]);

    render(<SocketSelector onSelect={onSelect} value={null} />);

    const lensButton = await screen.findByText('Action Items');
    fireEvent.click(lensButton);

    expect(onSelect).toHaveBeenCalledWith({ lens_type: 'preset', lens_id: 'action_items' });
  });

  it('clicking a socket calls onSelect with socket lens_type', async () => {
    listLenses.mockResolvedValue([]);
    listSockets.mockResolvedValue([
      { id: 'sock-1', name: 'My Socket', description: '' },
    ]);

    render(<SocketSelector onSelect={onSelect} value={null} />);

    const socketButton = await screen.findByText('My Socket');
    fireEvent.click(socketButton);

    expect(onSelect).toHaveBeenCalledWith({ lens_type: 'socket', lens_id: 'sock-1' });
  });

  it('selected lens has border-indigo-400/50 class', async () => {
    listLenses.mockResolvedValue([
      { id: 'action_items', name: 'Action Items' },
      { id: 'summary', name: 'Summary' },
    ]);
    listSockets.mockResolvedValue([]);

    render(
      <SocketSelector
        onSelect={onSelect}
        value={{ lens_type: 'preset', lens_id: 'action_items' }}
      />
    );

    const selectedButton = await screen.findByText('Action Items');
    await waitFor(() => {
      expect(selectedButton.closest('button').className).toContain('border-indigo-400/50');
    });

    const unselectedButton = screen.getByText('Summary');
    expect(unselectedButton.closest('button').className).not.toContain('border-indigo-400/50');
  });

  it('selected socket has border-indigo-400/50 class', async () => {
    listLenses.mockResolvedValue([]);
    listSockets.mockResolvedValue([
      { id: 'sock-1', name: 'My Socket' },
      { id: 'sock-2', name: 'Other Socket' },
    ]);

    render(
      <SocketSelector
        onSelect={onSelect}
        value={{ lens_type: 'socket', lens_id: 'sock-1' }}
      />
    );

    const selectedButton = await screen.findByText('My Socket');
    await waitFor(() => {
      expect(selectedButton.closest('button').className).toContain('border-indigo-400/50');
    });

    const unselectedButton = screen.getByText('Other Socket');
    expect(unselectedButton.closest('button').className).not.toContain('border-indigo-400/50');
  });
});
