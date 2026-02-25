import { useState, createContext, useContext } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const SearchContext = createContext({ query: '', setQuery: () => {} });

export function useSearch() {
  return useContext(SearchContext);
}

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <SearchContext.Provider value={{ query: searchQuery, setQuery: setSearchQuery }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
          <main className="flex-1 overflow-y-auto eb-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </SearchContext.Provider>
  );
}
