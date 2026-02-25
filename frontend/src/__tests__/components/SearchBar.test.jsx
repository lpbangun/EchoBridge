import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from '../../components/SearchBar';

describe('SearchBar', () => {
  const onFilterChange = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 6 filter chips', () => {
    render(<SearchBar onFilterChange={onFilterChange} activeFilter={null} />);
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
    render(<SearchBar onFilterChange={onFilterChange} activeFilter={null} />);
    fireEvent.click(screen.getByText('Startup Meeting'));
    expect(onFilterChange).toHaveBeenCalledWith('startup_meeting');
  });

  it('applies chip-active class to the active filter chip', () => {
    render(
      <SearchBar onFilterChange={onFilterChange} activeFilter="class_lecture" />
    );
    const activeChip = screen.getByText('Class Lecture').closest('button');
    expect(activeChip.className).toContain('chip-active');
  });

  it('"All" chip is active when activeFilter is null', () => {
    render(<SearchBar onFilterChange={onFilterChange} activeFilter={null} />);
    const allChip = screen.getByText('All').closest('button');
    expect(allChip.className).toContain('chip-active');
  });

  it('inactive chips have chip-inactive class', () => {
    render(
      <SearchBar onFilterChange={onFilterChange} activeFilter="class_lecture" />
    );
    const inactiveChip = screen.getByText('Startup Meeting').closest('button');
    expect(inactiveChip.className).toContain('chip-inactive');
  });

  it('calls onFilterChange with null when "All" chip is clicked', () => {
    render(
      <SearchBar onFilterChange={onFilterChange} activeFilter="working_session" />
    );
    fireEvent.click(screen.getByText('All'));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });
});
