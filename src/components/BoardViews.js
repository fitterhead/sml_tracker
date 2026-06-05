import { useEffect, useMemo, useState } from 'react';
import { buildTodoSectionId, columnMeta } from '../boardConfig';
import { useBoardStore } from '../store/useBoardStore';

const ALL_CARDS_PAGE_SIZE = 12;

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
  return (
    <main className="board-row">
      <div className="todo-board">
        <div className="todo-grid">
          {todoColumns.map((column, index) => (
            <div className="row-slot row-todo" key={column.id}>
              <CardSectionComponent
                lane="active"
                sectionId={buildTodoSectionId(column.id)}
                title={column.title}
                subtitle={index === 0 ? 'primary queue' : 'additional queue'}
                cards={lanes.activeByColumn[column.id] || []}
                onCreateCard={() => createCard(column.id)}
                onOpenAllCards={onOpenAllCards}
                onOpenCard={(card) => setFocusCardId(card.id)}
                onAddChecklistItem={addChecklistItem}
                onRequestChecklistToggle={onRequestChecklistToggle}
                onEditChecklistItem={onEditChecklistItem}
                onHoverPreview={onHoverPreview}
                onHoverPreviewMove={onHoverPreviewMove}
                onHoverPreviewEnd={onHoverPreviewEnd}
                showCreateButton={index === 0}
                showHeader
              />
            </div>
          ))}
        </div>
      </div>

      <div className="side-status-column">
        <div className="row-slot row-done">
          <CardSectionComponent
            lane="done"
            sectionId="done"
            cards={lanes.done}
            onCreateCard={createCard}
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

        <div className="row-slot row-hold">
          <CardSectionComponent
            lane="hold"
            sectionId="hold"
            cards={lanes.hold}
            onCreateCard={createCard}
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
        <h2>incomplete card</h2>
        <p>these cards stay out of the main board until project name and client name are filled in.</p>
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
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(cards.length / ALL_CARDS_PAGE_SIZE));
  const pageCards = useMemo(
    () =>
      cards.slice(
        (page - 1) * ALL_CARDS_PAGE_SIZE,
        page * ALL_CARDS_PAGE_SIZE
      ),
    [cards, page]
  );

  useEffect(() => {
    setPage(1);
  }, [lane, title]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

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
      <div className="all-cards-grid">
        {pageCards.map((card) => (
          <StaticCardComponent
            key={card.id}
            card={card}
            forceFull
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
      {totalPages > 1 ? (
        <nav className="all-cards-pagination" aria-label="cards pages">
          <button
            type="button"
            className="ghost-button muted"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            previous
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={`ghost-button ${pageNumber === page ? 'active' : 'muted'}`}
                onClick={() => setPage(pageNumber)}
                aria-current={pageNumber === page ? 'page' : undefined}
              >
                {pageNumber}
              </button>
            )
          )}
          <button
            type="button"
            className="ghost-button muted"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page === totalPages}
          >
            next
          </button>
        </nav>
      ) : null}
    </main>
  );
}
