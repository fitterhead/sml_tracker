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

  test('checklist items require two clicks before a card is finished', () => {
    useBoardStore.getState().createCard({
      taskName: 'Review project',
      jobName: 'Review client',
    });

    const card = useBoardStore
      .getState()
      .cards.find((item) => item.taskName === 'Review project');
    const checklistItem = card.checklist[0];

    useBoardStore.getState().toggleChecklistItem(card.id, checklistItem.id);
    let updatedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);

    expect(updatedCard.checklist[0].state).toBe('in_progress');
    expect(updatedCard.lane).toBe('active');

    useBoardStore.getState().toggleChecklistItem(card.id, checklistItem.id);
    updatedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);

    expect(updatedCard.checklist[0].state).toBe('completed');
    expect(updatedCard.lane).toBe('done');

    useBoardStore.getState().toggleChecklistItem(card.id, checklistItem.id);
    updatedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);

    expect(updatedCard.checklist[0].state).toBe('unchecked');
    expect(updatedCard.lane).toBe('active');
  });

  test('workspaces isolate cards and todo columns', () => {
    const firstWorkspaceId = useBoardStore.getState().activeWorkspaceId;

    useBoardStore.getState().createCard({
      taskName: 'Terroni project',
      jobName: 'Terroni',
    });
    useBoardStore.getState().createWorkspace('Prada');
    useBoardStore.getState().createCard({
      taskName: 'Prada project',
      jobName: 'Prada',
    });

    expect(
      useBoardStore.getState().cards.some((card) => card.jobName === 'Terroni')
    ).toBe(false);
    expect(
      useBoardStore.getState().cards.some((card) => card.jobName === 'Prada')
    ).toBe(true);

    useBoardStore.getState().switchWorkspace(firstWorkspaceId);

    expect(
      useBoardStore.getState().cards.some((card) => card.jobName === 'Terroni')
    ).toBe(true);
    expect(
      useBoardStore.getState().cards.some((card) => card.jobName === 'Prada')
    ).toBe(false);
  });

  test('updateCard also moves cards when checklist states become completed', () => {
    useBoardStore.getState().createCard({
      taskName: 'Focus project',
      jobName: 'Focus client',
    });

    const card = useBoardStore
      .getState()
      .cards.find((item) => item.taskName === 'Focus project');

    useBoardStore.getState().updateCard(card.id, {
      checklist: card.checklist.map((item) => ({
        ...item,
        state: 'completed',
        checked: true,
      })),
    });

    const updatedCard = useBoardStore
      .getState()
      .cards.find((item) => item.id === card.id);

    expect(updatedCard.lane).toBe('done');
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

test('moveCard rejects an unknown lane', () => {
  useBoardStore.getState().createCard({ taskName: 'Project', jobName: 'Client' });
  const card = useBoardStore.getState().cards.slice(-1)[0];
  useBoardStore.getState().moveCard(card.id, 'unknown');
  expect(useBoardStore.getState().cards.find((item) => item.id === card.id).lane).toBe('active');
  useBoardStore.getState().resetBoard();
});

test('clearing required details removes the completion timestamp', () => {
  useBoardStore.getState().createCard({ taskName: 'Project', jobName: 'Client' });
  const card = useBoardStore.getState().cards.slice(-1)[0];
  useBoardStore.getState().updateCard(card.id, {
    checklist: card.checklist.map((item) => ({ ...item, state: 'completed', checked: true })),
  });
  expect(useBoardStore.getState().cards.find((item) => item.id === card.id).completedAt).toBeTruthy();
  useBoardStore.getState().updateCard(card.id, { taskName: '' });
  const updated = useBoardStore.getState().cards.find((item) => item.id === card.id);
  expect(updated.lane).toBe('active');
  expect(updated.completedAt).toBe('');
  useBoardStore.getState().resetBoard();
});

test('card log applies once, retains source history after hydration, and stays in the active workspace', () => {
  const store = useBoardStore.getState();
  store.resetBoard();
  store.createCard({ taskName: 'Log project', jobName: 'Client' });
  const card = useBoardStore.getState().cards.slice(-1)[0];
  const input = { schema: 'sml-card-log/v1', source: 'Design meeting', updates: [{ match: { cardId: card.id }, fields: { assignedPerson: 'Alex' }, notes: ['Direction approved'], tasks: [{ text: card.checklist[0].text, context: 'Please check the PDF' }, { text: 'Send artwork' }] }] };
  expect(store.applyCardLog(input)).toBe(1);
  expect(store.applyCardLog(input)).toBe(0);
  const updated = useBoardStore.getState().cards.find((item) => item.id === card.id);
  expect(updated.assignedPerson).toBe('Alex');
  expect(updated.activityLog[0]).toMatchObject({ note: 'Direction approved', source: 'Design meeting' });
  expect(updated.checklist[1].id).toBeTruthy();
  expect(updated.checklist[0].contextHistory[0]).toMatchObject({ note: 'Please check the PDF', createdBy: expect.any(String), source: 'Design meeting' });
  const board = useBoardStore.getState();
  store.hydrateBoard(board);
  expect(useBoardStore.getState().cards.find((item) => item.id === card.id).activityLog[0].source).toBe('Design meeting');
  store.createWorkspace('Other');
  expect(store.applyCardLog(input)).toBe(0);
  store.resetBoard();
});

test('card log rechecks fields changed since preview instead of overwriting them', () => {
  const store = useBoardStore.getState();
  store.resetBoard();
  store.createCard({ taskName: 'Project', jobName: 'Client' });
  const card = useBoardStore.getState().cards.slice(-1)[0];
  const input = { schema: 'sml-card-log/v1', source: 'Email', updates: [{ match: { cardId: card.id }, fields: { assignedPerson: 'Alex' } }] };
  store.updateCard(card.id, { assignedPerson: 'Taylor' });
  expect(store.applyCardLog(input)).toBe(0);
  expect(useBoardStore.getState().cards.find((item) => item.id === card.id).assignedPerson).toBe('Taylor');
  store.resetBoard();
});

test('formatted titles and context survive board hydration with their styles', () => {
  const { serializeRichText, richTextToPlainText } = require('../lib/richText');
  const store = useBoardStore.getState();
  store.resetBoard();
  const formatted = serializeRichText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review artwork', marks: [{ type: 'italic' }, { type: 'textStyle', attrs: { color: '#2457a6' } }] }] }] });
  store.createCard({ taskName: formatted, jobName: 'Client' });
  const card = useBoardStore.getState().cards.slice(-1)[0];
  store.updateCard(card.id, { checklist: card.checklist.map((item) => ({ ...item, context: formatted })) });
  store.hydrateBoard(JSON.parse(JSON.stringify(useBoardStore.getState())));
  const restored = useBoardStore.getState().cards.find((item) => item.id === card.id);
  expect(restored.taskName).toBe(formatted);
  expect(restored.checklist[0].context).toBe(formatted);
  expect(richTextToPlainText(restored.taskName)).toBe('Review artwork');
  store.resetBoard();
});

test('restores the current user’s most recent workspace rather than the server selection', () => {
  const store = useBoardStore.getState();
  store.resetBoard();
  const user = { id: 'recent-user', email: 'recent@example.com', name: 'Recent user', role: 'manager' };
  store.hydrateBoard(useBoardStore.getState(), user);
  const firstId = useBoardStore.getState().activeWorkspaceId;
  store.createWorkspace('Recent workspace');
  const recentId = useBoardStore.getState().activeWorkspaceId;
  store.updateUserPreferences(require('./useBoardStore').getDefaultUserPreferences());
  const serverBoard = JSON.parse(JSON.stringify(useBoardStore.getState()));
  serverBoard.activeWorkspaceId = firstId;
  store.hydrateBoard(serverBoard, user);
  expect(useBoardStore.getState().activeWorkspaceId).toBe(recentId);
  store.switchWorkspace(firstId);
  store.hydrateBoard({ ...serverBoard, activeWorkspaceId: recentId }, user);
  expect(useBoardStore.getState().activeWorkspaceId).toBe(firstId);
  store.hydrateBoard({ ...serverBoard, activeWorkspaceId: recentId }, { ...user, id: 'other', email: 'other@example.com' });
  expect(useBoardStore.getState().activeWorkspaceId).toBe(recentId);
  store.resetBoard();
  store.hydrateBoard(useBoardStore.getState(), user);
  expect(useBoardStore.getState().activeWorkspaceId).not.toBe(recentId);
  store.resetBoard();
});
