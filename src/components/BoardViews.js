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
                showCreateButton={index === 0}
                showHeader={index === 0}
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
      <div className="all-cards-grid">
        {cards.map((card) => (
          <StaticCardComponent
            key={card.id}
            card={card}
            forceFull
            isFrontCard={false}
            zIndex={10}
            onClick={() => onOpenCard(card)}
            onDoubleClick={() => {}}
            onAddChecklistItem={(text) => onAddChecklistItem(card.id, text)}
            onRequestChecklistToggle={(item) => onRequestChecklistToggle(card.id, item)}
            onEditChecklistItem={(item) => onEditChecklistItem(card.id, item)}
            onPriorityChange={(priority) =>
              useBoardStore.getState().updateCard(card.id, { priority })
            }
          />
        ))}
      </div>
    </main>
  );
}
