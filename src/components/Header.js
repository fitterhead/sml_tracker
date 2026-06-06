import { useRef, useState } from 'react';
import { useBoardStore } from '../store/useBoardStore';

export default function Header({
  searchTerm,
  setSearchTerm,
  viewMode,
  sortMode,
  sortOptions,
  onMainPage,
  onIncompleteCards,
  onExportExcel,
  onSortChange,
  onSettings,
  onLogout,
}) {
  const currentUser = useBoardStore((state) => state.currentUser);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const searchInputRef = useRef(null);
  const clearSearch = () => {
    setSearchTerm('');
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  const selectSearchText = (event) => {
    window.requestAnimationFrame(() => event.currentTarget.select());
  };

  return (
    <header className="app-header">
      <button type="button" className="brand" onClick={onMainPage}>
        <div className="brand-mark">F</div>
        <div>
          <strong>SML PROJECT NOTE</strong>
        </div>
      </button>

      <div className="search-bar">
        <label className="search-field">
          <span>search</span>
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onFocus={selectSearchText}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                clearSearch();
              }
            }}
            placeholder="search projects, clients..."
          />
          {searchTerm ? (
            <button
              type="button"
              className="search-clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSearch}
              aria-label="clear search"
              title="clear search"
            >
              X
            </button>
          ) : null}
        </label>
        <div className="search-actions">
          <button
            type="button"
            className={viewMode === 'incomplete' ? 'active header-link' : 'header-link'}
            onClick={onIncompleteCards}
          >
            incomplete card
          </button>
          <button type="button" className="header-link" onClick={onExportExcel}>
            export excel
          </button>
          <div className="workspace-filter header-filter">
          <button
            type="button"
            className="workspace-filter-button"
            onClick={() => setFilterOpen((current) => !current)}
            aria-expanded={filterOpen}
            aria-haspopup="menu"
          >
            Filter
          </button>
          {filterOpen ? (
            <div className="workspace-filter-menu" role="menu">
              {sortOptions.map((option) => (
                <button
                  type="button"
                  role="menuitem"
                  className={sortMode === option.value ? 'active' : ''}
                  key={option.value}
                  onClick={() => {
                    onSortChange(option.value);
                    setFilterOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <div className="header-actions">
        <div className="account-menu">
          <button
            type="button"
            className="profile-chip"
            onClick={() => setAccountOpen((current) => !current)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
          >
          <span>{currentUser.name}</span>
          <small>{currentUser.role}</small>
          </button>
          {accountOpen ? (
            <div className="account-menu-list" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  onSettings();
                }}
              >
                Settings
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  onLogout();
                }}
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
