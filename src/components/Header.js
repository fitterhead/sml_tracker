import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../store/useBoardStore';

export default function Header({ searchTerm, setSearchTerm, viewMode, sortMode, sortOptions, onMainPage, onIncompleteCards, onExportExcel, onSortChange, onSettings, onLogout, onPasteLog, incompleteCount = 0, syncStatus = '' }) {
  const currentUser = useBoardStore((state) => state.currentUser);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const searchInputRef = useRef(null);
  const headerRef = useRef(null);
  useEffect(() => {
    const closeMenus = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && headerRef.current?.contains(event.target)) return;
      setFilterOpen(false); setAccountOpen(false);
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeMenus);
    };
  }, []);
  const clearSearch = () => {
    setSearchTerm('');
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  const runAccountAction = (action) => { setAccountOpen(false); action(); };
  return (
    <header className="app-header" ref={headerRef}>
      <button type="button" className="brand" onClick={onMainPage}><strong>SML PROJECT NOTE</strong></button>
      <div className="search-bar">
        <label className="search-field">
          <span>search</span>
          <input ref={searchInputRef} type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); clearSearch(); } }} placeholder="Search projects, clients…" />
          {searchTerm && <button type="button" className="search-clear" onMouseDown={(event) => event.preventDefault()} onClick={clearSearch} aria-label="clear search">×</button>}
        </label>
      </div>
      <div className="header-actions">
        <span className={`save-status ${/failed|refresh/.test(syncStatus) ? 'save-status-error' : ''}`} role="status">{syncStatus}</span>
        <div className="account-menu">
          <button type="button" className="profile-chip" onClick={() => { setAccountOpen(!accountOpen); setFilterOpen(false); }} aria-expanded={accountOpen} aria-haspopup="menu"><span>{currentUser.name}</span><small>{currentUser.role}</small></button>
          {accountOpen && <div className="account-menu-list" role="menu">
            <button type="button" role="menuitem" onClick={() => runAccountAction(onExportExcel)}>Excel import / export</button>
            <button type="button" role="menuitem" onClick={() => runAccountAction(onSettings)}>Settings</button>
            <button type="button" role="menuitem" onClick={() => runAccountAction(onLogout)}>Logout</button>
          </div>}
        </div>
      </div>
      <div className="app-toolbar">
        <nav className="board-navigation" aria-label="Board views">
          <button type="button" className={viewMode !== 'incomplete' ? 'active' : ''} aria-current={viewMode !== 'incomplete' ? 'page' : undefined} onClick={onMainPage}>Board</button>
          <button type="button" className={viewMode === 'incomplete' ? 'active' : ''} aria-current={viewMode === 'incomplete' ? 'page' : undefined} onClick={onIncompleteCards}>Needs details <span className="nav-count">{incompleteCount}</span></button>
        </nav>
        <div className="toolbar-tools">
          <button type="button" className="log-launch-button" onClick={onPasteLog}>Paste update log</button>
          <div className="workspace-filter header-filter">
            <button type="button" className={`workspace-filter-button ${sortMode ? 'has-sort' : ''}`} aria-label="Filter" onClick={() => { setFilterOpen(!filterOpen); setAccountOpen(false); }} aria-expanded={filterOpen} aria-haspopup="menu">Sort <span aria-hidden="true">⌄</span></button>
            {filterOpen && <div className="workspace-filter-menu" role="menu">
              <button type="button" role="menuitem" className={!sortMode ? 'active' : ''} onClick={() => { onSortChange(''); setFilterOpen(false); }}>Default order</button>
              {sortOptions.map((option) => <button type="button" role="menuitem" className={sortMode === option.value ? 'active' : ''} key={option.value} onClick={() => { onSortChange(option.value); setFilterOpen(false); }}>{option.label}</button>)}
            </div>}
          </div>
        </div>
      </div>
    </header>
  );
}
