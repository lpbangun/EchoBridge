import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from '../../components/SearchBar';

describe('SearchBar', () => {
  const onSearch = vi.fn();
  const onFilterChange = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input with placeholder', () => {
    render(<SearchBar onSearch={onSearch} onFilterChange={onFilterChange} activeFilter={null} />);
    expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument();
  });

  it('calls onSearch with value when typing', () => {
    render(<SearchBar onSearch={onSearch} onFilterChange={onFilterChange} activeFilter={null} />);
    const input = screen.getByPlaceholderText('Search sessions...');
    fireEvent.change(input, { target: { value: 'test query' } });
    expect(onSearch).toHaveBeenCalledWith('test query');
  });

  it('renders all 6 filter chips', () => {
    render(<SearchBar onSearch={onSearch} onFilterChange={onFilterChange} activeFilter={null} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(6);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Class Lecture')).toBeInTheDocument();
    expect(screen.getByText('Startup Meeting')).toBeInTheDocument();
    expect(screen.getByText('Research Discussion')).toBeInTheDocument();
    expect(screen.getByText('Working Session')).toBeInTheDocument();
    expect(screen.getByText('Talk / Seminar')).toBeInTheDocument();
  });

  it('calls onFilterChange with filter id when chip is clicked', () => {
    render(<SearchBar onSearch={onSearch} onFilterChange={onFilterChange} activeFilter={null} />);
    fireEvent.click(screen.getByText('Startup Meeting'));
    expect(onFilterChange).toHaveBeenCalledWith('startup_meeting');
  });

  it('applies active styles to the active filter chip', () => {
    render(
      <SearchBar onSearch={onSearch} onFilterChange={onFilterChange} activeFilter="class_lecture" />
    );
    const activeChip = screen.getByText('Class Lecture').closest('button');
    expect(activeChip.className).toContain('bg-orange-500/20');
    expect(activeChip.className).toContain('border-orange-400/50');
  });

  it('"All" chip is active when activeFilter is null', () => {
    render(<SearchBar onSearch={onSearch} onFilterChange={onFilterChange} activeFilter={null} />);
    const allChip = screen.getByText('All').closest('button');
    expect(allChip.className).toContain('bg-orange-500/20');
    expect(allChip.className).toContain('border-orange-400/50');
  });

  it('calls onFilterChange with null when "All" chip is clicked', () => {
    render(
      <SearchBar onSearch={onSearch} onFilterChange={onFilterChange} activeFilter="working_session" />
    );
    fireEvent.click(screen.getByText('All'));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });
});
