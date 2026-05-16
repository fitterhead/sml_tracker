import { useBoardStore } from './useBoardStore';

describe('useBoardStore', () => {
  afterEach(() => {
    localStorage.clear();
    useBoardStore.getState().resetBoard();
  });

  test('deleteCard removes the selected card and keeps a placeholder board', () => {
    const initialCards = useBoardStore.getState().cards;
    const cardToDelete = initialCards[0];

    useBoardStore.getState().deleteCard(cardToDelete.id);

    const remainingCards = useBoardStore.getState().cards;

    expect(remainingCards).toHaveLength(1);
    expect(remainingCards.some((card) => card.id === cardToDelete.id)).toBe(false);
    expect(remainingCards[0].taskName).toBe('');
    expect(remainingCards[0].jobName).toBe('');
  });

  test('deleteTodoColumn moves cards from an extra column and keeps two todo columns', () => {
    useBoardStore.getState().addTodoColumn();

    const [primaryColumn, extraColumn] = useBoardStore.getState().todoColumns;

    useBoardStore.getState().createCard({
      taskName: 'Extra project',
      jobName: 'Extra client',
      todoColumnId: extraColumn.id,
    });

    useBoardStore.getState().deleteTodoColumn(extraColumn.id);

    const state = useBoardStore.getState();
    const movedCard = state.cards.find((card) => card.taskName === 'Extra project');

    expect(state.todoColumns).toHaveLength(2);
    expect(state.todoColumns[0].id).toBe(primaryColumn.id);
    expect(state.todoColumns.some((column) => column.id === extraColumn.id)).toBe(false);
    expect(movedCard.todoColumnId).toBe(primaryColumn.id);
  });

  test('moveCard keeps incomplete cards in place when dropped on hold', () => {
    const card = useBoardStore.getState().cards[0];

    useBoardStore.getState().moveCard(card.id, 'hold');

    const movedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);

    expect(movedCard.lane).toBe('active');
  });

  test('moveCard falls back to the primary todo column when target column is stale', () => {
    const primaryColumn = useBoardStore.getState().todoColumns[0];

    useBoardStore.getState().createCard({
      taskName: 'Visible project',
      jobName: 'Visible client',
      todoColumnId: 'old-column-id',
    });

    const card = useBoardStore
      .getState()
      .cards.find((item) => item.taskName === 'Visible project');

    useBoardStore.getState().moveCard(card.id, 'active');

    const movedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);

    expect(movedCard.todoColumnId).toBe(primaryColumn.id);
  });

  test('importCards adds spreadsheet cards with checklist details', () => {
    useBoardStore.getState().importCards([
      {
        taskName: 'Imported project',
        jobName: 'Imported client',
        assignedPerson: 'Andrew',
        startDate: '2026-05-10',
        priority: 3,
        checklist: [
          {
            text: 'Imported checklist',
            context: 'from excel',
            checked: true,
            checkedBy: 'manager',
          },
        ],
      },
    ]);

    const importedCard = useBoardStore
      .getState()
      .cards.find((item) => item.taskName === 'Imported project');

    expect(importedCard).toBeTruthy();
    expect(importedCard.jobName).toBe('Imported client');
    expect(importedCard.priority).toBe(3);
    expect(importedCard.checklist[0].text).toBe('Imported checklist');
    expect(importedCard.checklist[0].checked).toBe(true);
  });

  test('toggleChecklistItem keeps older contexts as checklist history', () => {
    useBoardStore.getState().createCard({
      taskName: 'Context project',
      jobName: 'Context client',
    });

    const card = useBoardStore
      .getState()
      .cards.find((item) => item.taskName === 'Context project');
    const checklistItem = card.checklist[0];

    useBoardStore
      .getState()
      .toggleChecklistItem(card.id, checklistItem.id, 'first note');
    useBoardStore
      .getState()
      .toggleChecklistItem(card.id, checklistItem.id, 'second note');

    const updatedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);
    const updatedItem = updatedCard.checklist[0];

    expect(updatedItem.context).toBe('second note');
    expect(updatedItem.contextHistory).toHaveLength(1);
    expect(updatedItem.contextHistory[0].note).toBe('first note');
  });

  test('toggleChecklistItem can use context history prepared by a popup', () => {
    useBoardStore.getState().createCard({
      taskName: 'Popup context project',
      jobName: 'Popup context client',
    });

    const card = useBoardStore
      .getState()
      .cards.find((item) => item.taskName === 'Popup context project');
    const checklistItem = {
      ...card.checklist[0],
      context: 'old popup note',
      contextCreatedAt: '2026-05-09T00:00:00.000Z',
      contextHistory: [],
    };

    useBoardStore.getState().updateCard(card.id, {
      checklist: [checklistItem],
    });

    useBoardStore.getState().toggleChecklistItem(
      card.id,
      checklistItem.id,
      'new popup note',
      {
        context: 'new popup note',
        contextCreatedAt: '2026-05-10T00:00:00.000Z',
        contextHistory: [
          {
            note: 'old popup note',
            createdAt: '2026-05-09T00:00:00.000Z',
            completedAt: '',
          },
        ],
      }
    );

    const updatedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);
    const updatedItem = updatedCard.checklist[0];

    expect(updatedItem.context).toBe('new popup note');
    expect(updatedItem.contextHistory).toHaveLength(1);
    expect(updatedItem.contextHistory[0].note).toBe('old popup note');
  });
});
