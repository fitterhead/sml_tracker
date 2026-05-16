import { useBoardStore } from '../store/useBoardStore';

export default function Header({
  searchTerm,
  setSearchTerm,
  viewMode,
  onMainPage,
  onIncompleteCards,
  onExportExcel,
  onLogout,
}) {
  const currentUser = useBoardStore((state) => state.currentUser);

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
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="search projects, clients..."
          />
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
        </div>
      </div>

      <div className="header-actions">
        <div className="profile-chip">
          <span>{currentUser.name}</span>
          <small>{currentUser.role}</small>
        </div>
        <button type="button" className="header-link" onClick={onLogout}>
          logout
        </button>
      </div>
    </header>
  );
}
