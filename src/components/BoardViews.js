import { useState } from 'react';
import { buildTodoSectionId, columnMeta } from '../boardConfig';
import { useBoardStore } from '../store/useBoardStore';

export function BoardLayout({
  CardSectionComponent,
  lanes,
  todoColumns,
  createCard,
  onOpenAllCards,
  setFocusCardId,
  addChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
  onHoverPreview,
  onHoverPreviewMove,
  onHoverPreviewEnd,
}) {
  const [mobileLane, setMobileLane] = useState('active');
  const [expanded, setExpanded] = useState({ hold: false, done: false });
  const renderSection = (lane, extra = {}) => <CardSectionComponent
    lane={lane}
    sectionId={lane}
    cards={lanes[lane] || []}
    onCreateCard={createCard}
    onOpenAllCards={onOpenAllCards}
    onOpenCard={(card) => setFocusCardId(card.id)}
    onAddChecklistItem={addChecklistItem}
    onRequestChecklistToggle={onRequestChecklistToggle}
    onEditChecklistItem={onEditChecklistItem}
    {...extra}
  />;
  return (
    <main className="board-row">
      <nav className="mobile-status-tabs" aria-label="Card status">
        {[
          ['active', 'To Do', Object.values(lanes.activeByColumn).reduce((count, items) => count + items.length, 0)],
          ['hold', 'On Hold', lanes.hold.length], ['done', 'Finish', lanes.done.length],
        ].map(([lane, label, count]) => <button type="button" key={lane} aria-label={`${label}, ${count} cards`} aria-pressed={mobileLane === lane} onClick={() => setMobileLane(lane)}>{label}<span>{count}</span></button>)}
      </nav>
      <div className={`todo-board board-panel ${mobileLane === 'active' ? 'is-mobile-active' : ''}`}>
        <div className="todo-grid">
          {todoColumns.map((column) => <div className="row-slot row-todo" key={column.id}>
            <CardSectionComponent lane="active" sectionId={buildTodoSectionId(column.id)} title={column.title}
              cards={lanes.activeByColumn[column.id] || []}
              onCreateCard={() => createCard(column.id)} onOpenAllCards={onOpenAllCards}
              onOpenCard={(card) => setFocusCardId(card.id)} onAddChecklistItem={addChecklistItem}
              onRequestChecklistToggle={onRequestChecklistToggle} onEditChecklistItem={onEditChecklistItem}
              showCreateButton={false} showHeader />
          </div>)}
        </div>
      </div>
      <div className="side-status-column">
        {['hold', 'done'].map((lane) => <div className={`row-slot row-${lane} board-panel ${mobileLane === lane ? 'is-mobile-active' : ''}`} key={lane}>
          {renderSection(lane, {
            collapsed: !expanded[lane] && mobileLane !== lane,
            onToggleCollapse: () => setExpanded((current) => ({ ...current, [lane]: !current[lane] })),
          })}
        </div>)}
      </div>
    </main>
  );
}

export function IncompletePage({
  CardSectionComponent,
  lanes,
  onOpenAllCards,
  setFocusCardId,
  addChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
  onHoverPreview,
  onHoverPreviewMove,
  onHoverPreviewEnd,
}) {
  return (
    <main className="incomplete-page">
      <div className="incomplete-page-head">
        <h2>Needs details</h2>
        <p>Add a project and client name to move these cards onto the board.</p>
      </div>

      <div className="incomplete-page-body">
        <CardSectionComponent
          lane="incomplete"
          sectionId="incomplete"
          cards={lanes.incomplete}
          onCreateCard={() => {}}
          onOpenAllCards={onOpenAllCards}
          onOpenCard={(card) => setFocusCardId(card.id)}
          onAddChecklistItem={addChecklistItem}
          onRequestChecklistToggle={onRequestChecklistToggle}
          onEditChecklistItem={onEditChecklistItem}
          onHoverPreview={onHoverPreview}
          onHoverPreviewMove={onHoverPreviewMove}
          onHoverPreviewEnd={onHoverPreviewEnd}
        />
      </div>
    </main>
  );
}

export function AllCardsPage({
  StaticCardComponent,
  lane,
  title,
  cards,
  onBack,
  onOpenCard,
  onAddChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
  onHoverPreview,
  onHoverPreviewMove,
  onHoverPreviewEnd,
}) {
  const meta = columnMeta[lane];

  return (
    <main className="all-cards-page">
      <div className="all-cards-head">
        <button type="button" className="ghost-button" onClick={onBack}>
          back
        </button>
        <div>
          <h2>{title || meta.title}</h2>
          <p>{cards.length} cards</p>
        </div>
      </div>
      {cards.length === 0 && <p className="view-empty-state">No cards match your search in this section.</p>}
      <div className="all-cards-grid">
        {cards.map((card) => (
          <StaticCardComponent
            key={card.id}
            card={card}
            isFrontCard={false}
            zIndex={10}
            onClick={() => onOpenCard(card)}
            onDoubleClick={() => {}}
            onAddChecklistItem={(text) => onAddChecklistItem(card.id, text)}
            onRequestChecklistToggle={(item, nextState) =>
              onRequestChecklistToggle(card.id, item, nextState)
            }
            onEditChecklistItem={(item) => onEditChecklistItem(card.id, item)}
            onPriorityChange={(priority) =>
              useBoardStore.getState().updateCard(card.id, { priority })
            }
            onHoverPreview={onHoverPreview}
            onHoverPreviewMove={onHoverPreviewMove}
            onHoverPreviewEnd={onHoverPreviewEnd}
          />
        ))}
      </div>
    </main>
  );
}
