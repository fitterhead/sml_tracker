import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const ACTIVE = 'active';
const DONE = 'done';
const HOLD = 'hold';
const TODO_COLUMN_LIMIT = 2;
const DEFAULT_PRIORITY = 1;

const getPrimaryTodoColumnId = (todoColumns) => todoColumns[0]?.id || '';

const getValidTodoColumnId = (todoColumns, todoColumnId) =>
  todoColumns.some((column) => column.id === todoColumnId)
    ? todoColumnId
    : getPrimaryTodoColumnId(todoColumns);

const createTodoColumn = (title = 'To Do') => ({
  id: createId(),
  title,
});

const createSeedTodoColumns = () => [createTodoColumn('To Do'), createTodoColumn('To Do 2')];

const normalizeTodoColumns = (todoColumns = []) => {
  const visibleColumns = Array.isArray(todoColumns)
    ? todoColumns.slice(0, TODO_COLUMN_LIMIT)
    : [];

  while (visibleColumns.length < TODO_COLUMN_LIMIT) {
    visibleColumns.push(createTodoColumn(`To Do ${visibleColumns.length + 1}`));
  }

  return visibleColumns;
};

const createId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `card-${Math.random().toString(36).slice(2, 11)}`;
};

const createChecklistItem = (text, createdBy, overrides = {}) => ({
  id: createId(),
  text,
  checked: false,
  checkedBy: null,
  createdAt: new Date().toISOString(),
  completedAt: '',
  context: '',
  contextCreatedAt: '',
  contextCompletedAt: '',
  contextCreatedBy: '',
  contextHistory: [],
  createdBy,
  ...overrides,
});

export const createSeedCards = (todoColumns = createSeedTodoColumns()) => [
  {
    id: createId(),
    taskName: '',
    jobName: '',
    assignedPerson: '',
    startDate: '',
    createdAt: new Date().toISOString(),
    completedAt: '',
    lane: ACTIVE,
    todoColumnId: todoColumns[0]?.id || '',
    priority: DEFAULT_PRIORITY,
    order: 1,
    checklist: [createChecklistItem('add checklist item', 'manager')],
  },
];

const getHighestOrder = (cards) =>
  cards.reduce((max, card) => Math.max(max, card.order ?? 0), 0);

export const isCardIncomplete = (card) =>
  !card.taskName.trim() || !card.jobName.trim();

export const getMissingFields = (card) => {
  const missing = [];

  if (!card.taskName.trim()) {
    missing.push('project name');
  }

  if (!card.jobName.trim()) {
    missing.push('client name');
  }

  return missing;
};

export const isCardComplete = (card) =>
  card.checklist.length > 0 && card.checklist.every((item) => item.checked);

export const getCardZone = (card) => {
  if (isCardIncomplete(card)) {
    return 'incomplete';
  }

  if (card.lane === DONE) {
    return DONE;
  }

  return card.lane === HOLD ? HOLD : ACTIVE;
};

const bumpCardOrder = (cards, cardId) => {
  const highestOrder = getHighestOrder(cards) + 1;

  return cards.map((card) =>
    card.id === cardId ? { ...card, order: highestOrder } : card
  );
};

const normalizeChecklistItem = (item = {}, createdBy = 'manager') => ({
  id: item.id || createId(),
  text: item.text || 'checklist item',
  checked: Boolean(item.checked),
  checkedBy: item.checkedBy || null,
  createdAt: item.createdAt || item.completedAt || new Date().toISOString(),
  completedAt: item.completedAt || '',
  context: item.context || '',
  contextCreatedAt: item.contextCreatedAt || item.createdAt || '',
  contextCompletedAt: item.contextCompletedAt || '',
  contextCreatedBy: item.contextCreatedBy || item.contextUpdatedBy || '',
  contextHistory: Array.isArray(item.contextHistory)
    ? item.contextHistory.map((entry = {}) => ({
        note: entry.note || '',
        createdAt: entry.createdAt || '',
        completedAt: entry.completedAt || '',
        createdBy: entry.createdBy || entry.updatedBy || '',
      }))
    : [],
  createdBy: item.createdBy || createdBy,
});

const normalizeCardsForTodoColumns = (cards = [], todoColumns = []) => {
  const fallbackTodoColumnId = getPrimaryTodoColumnId(todoColumns);
  const todoColumnIds = new Set(todoColumns.map((column) => column.id));

  return Array.isArray(cards) && cards.length > 0
    ? cards.map((card, index) => ({
        ...card,
        id: card.id || createId(),
        taskName: card.taskName || '',
        jobName: card.jobName || '',
        assignedPerson: card.assignedPerson || '',
        startDate: card.startDate || '',
        createdAt: card.createdAt || card.startDate || new Date().toISOString(),
        completedAt: card.completedAt || '',
        lane: card.lane || ACTIVE,
        todoColumnId: todoColumnIds.has(card.todoColumnId)
          ? card.todoColumnId
          : fallbackTodoColumnId,
        priority: Number(card.priority) || DEFAULT_PRIORITY,
        order: Number(card.order) || index + 1,
        checklist:
          Array.isArray(card.checklist) && card.checklist.length > 0
            ? card.checklist.map((item) =>
                normalizeChecklistItem(item, item.createdBy || 'manager')
              )
            : [createChecklistItem('add checklist item', 'manager')],
      }))
    : createSeedCards(todoColumns);
};

const normalizeBoardPayload = (board = {}) => {
  const todoColumns = normalizeTodoColumns(board.todoColumns);

  return {
    todoColumns,
    cards: normalizeCardsForTodoColumns(board.cards, todoColumns),
  };
};

export const useBoardStore = create(
  persist(
    (set, get) => {
      const initialTodoColumns = createSeedTodoColumns();

      return {
        todoColumns: initialTodoColumns,
        cards: createSeedCards(initialTodoColumns),
        currentUser: {
          name: 'Andrew',
          role: 'manager',
          isAuthenticated: true,
        },
        addTodoColumn() {
          set((state) => ({
            todoColumns: normalizeTodoColumns(state.todoColumns),
          }));
        },
        deleteTodoColumn(columnId) {
          set((state) => {
            if (state.todoColumns.length <= 1 || state.todoColumns[0]?.id === columnId) {
              return state;
            }

            const fallbackTodoColumnId = state.todoColumns[0]?.id || '';
            const filteredTodoColumns = state.todoColumns.filter(
              (column) => column.id !== columnId
            );

            if (filteredTodoColumns.length === state.todoColumns.length) {
              return state;
            }

            const nextTodoColumns = normalizeTodoColumns(filteredTodoColumns);

            return {
              todoColumns: nextTodoColumns,
              cards: state.cards.map((card) =>
                card.todoColumnId === columnId
                  ? { ...card, todoColumnId: fallbackTodoColumnId }
                  : card
              ),
            };
          });
        },
        setRole(role) {
          set((state) => ({
            currentUser: {
              ...state.currentUser,
              role,
            },
          }));
        },
        hydrateBoard(board = {}, user = null) {
          const normalizedBoard = normalizeBoardPayload(board);

          set((state) => ({
            ...normalizedBoard,
            currentUser: user
              ? {
                  name: user.name || state.currentUser.name,
                  role: user.role || state.currentUser.role,
                  isAuthenticated: true,
                }
              : state.currentUser,
          }));
        },
        logoutUser() {
          set((state) => ({
            currentUser: {
              ...state.currentUser,
              isAuthenticated: false,
            },
          }));
        },
        bringToFront(cardId) {
          set((state) => ({
            cards: bumpCardOrder(state.cards, cardId),
          }));
        },
        createCard(initialValues = {}) {
          set((state) => {
            const highestOrder = getHighestOrder(state.cards) + 1;
            const userRole = state.currentUser.role;
            const nextNumber = state.cards.length + 1;
            const fallbackTodoColumnId =
              initialValues.todoColumnId || state.todoColumns[0]?.id || '';
            const taskName =
              initialValues.taskName?.trim() || `project ${nextNumber}`;
            const jobName =
              initialValues.jobName?.trim() || `client ${nextNumber}`;

            return {
              cards: [
                ...state.cards,
                {
                  id: createId(),
                  taskName,
                  jobName,
                  assignedPerson: initialValues.assignedPerson?.trim() || '',
                  startDate: initialValues.startDate || '',
                  createdAt: new Date().toISOString(),
                  completedAt: '',
                  lane: initialValues.lane || ACTIVE,
                  todoColumnId: fallbackTodoColumnId,
                  priority: initialValues.priority ?? DEFAULT_PRIORITY,
                  order: highestOrder,
                  checklist: [
                    createChecklistItem('add first checklist item', userRole),
                  ],
                },
              ],
            };
          });
        },
        importCards(importedCards = []) {
          set((state) => {
            const userRole = state.currentUser.role;
            let nextOrder = getHighestOrder(state.cards);
            const fallbackTodoColumnId = state.todoColumns[0]?.id || '';
            const nextCards = importedCards
              .map((item) => {
                const taskName = String(item.taskName || '').trim();
                const jobName = String(item.jobName || '').trim();
                const checklistItems = Array.isArray(item.checklist)
                  ? item.checklist
                  : [];
                const checklist =
                  checklistItems.length > 0
                    ? checklistItems.map((checkItem) =>
                        createChecklistItem(
                          String(checkItem.text || '').trim() || 'imported checklist item',
                          checkItem.createdBy || userRole,
                          {
                            checked: Boolean(checkItem.checked),
                            checkedBy: checkItem.checkedBy || null,
                            completedAt: checkItem.completedAt || '',
                            context: String(checkItem.context || '').trim(),
                            contextCreatedAt: checkItem.context
                              ? new Date().toISOString()
                              : '',
                            contextCompletedAt: '',
                            contextCreatedBy: checkItem.context
                              ? state.currentUser.name
                              : '',
                            contextHistory: Array.isArray(checkItem.contextHistory)
                              ? checkItem.contextHistory
                              : [],
                          }
                        )
                      )
                    : [createChecklistItem('imported checklist item', userRole)];

                nextOrder += 1;

                return {
                  id: createId(),
                  taskName,
                  jobName,
                  assignedPerson: String(item.assignedPerson || '').trim(),
                  startDate: item.startDate || '',
                  createdAt: new Date().toISOString(),
                  completedAt: '',
                  lane: item.lane || ACTIVE,
                  todoColumnId: fallbackTodoColumnId,
                  priority: Number(item.priority) || DEFAULT_PRIORITY,
                  order: nextOrder,
                  checklist,
                };
              })
              .filter((item) => item.taskName || item.jobName);

            if (nextCards.length === 0) {
              return state;
            }

            return {
              cards: [...state.cards, ...nextCards],
            };
          });
        },
        updateCard(cardId, updates) {
          set((state) => ({
            cards: state.cards.map((card) => {
              if (card.id !== cardId) {
                return card;
              }

              const nextCard = { ...card, ...updates };

              if (isCardIncomplete(nextCard)) {
                return { ...nextCard, lane: ACTIVE };
              }

              return nextCard;
            }),
          }));
        },
        renameClient(oldName, newName) {
          const previousName = String(oldName || '').trim();
          const nextName = String(newName || '').trim();

          if (!previousName || !nextName) {
            return;
          }

          set((state) => ({
            cards: state.cards.map((card) =>
              card.jobName.trim() === previousName
                ? { ...card, jobName: nextName }
                : card
            ),
          }));
        },
        deleteCard(cardId) {
          set((state) => {
            const nextCards = state.cards.filter((card) => card.id !== cardId);

            return {
              cards:
                nextCards.length > 0
                  ? nextCards
                  : createSeedCards(state.todoColumns),
            };
          });
        },
        addChecklistItem(cardId, input = '') {
          set((state) => ({
            cards: state.cards.map((card) =>
              card.id === cardId
                ? (() => {
                    const nextInput =
                      typeof input === 'string'
                        ? { text: input, context: '' }
                        : {
                            text: input?.text || '',
                            context: input?.context || '',
                          };

                    return {
                      ...card,
                      lane:
                        card.lane === HOLD || card.lane === DONE
                          ? ACTIVE
                          : card.lane,
                      completedAt:
                        card.lane === HOLD || card.lane === DONE
                          ? ''
                          : card.completedAt || '',
                      checklist: [
                        ...card.checklist,
                        createChecklistItem(
                          nextInput.text || 'new checklist item',
                          state.currentUser.role,
                          {
                            context: nextInput.context.trim(),
                            contextCreatedAt: nextInput.context.trim()
                              ? new Date().toISOString()
                              : '',
                            contextCompletedAt: '',
                            contextCreatedBy: nextInput.context.trim()
                              ? state.currentUser.name
                              : '',
                          }
                        ),
                      ],
                    };
                  })()
                : card
            ),
          }));
        },
        toggleChecklistItem(cardId, itemId, context = '', contextData = null) {
          set((state) => ({
            cards: state.cards.map((card) => {
              if (card.id !== cardId) {
                return card;
              }

              if (card.lane === HOLD) {
                return card;
              }

              const nextChecklist = card.checklist.map((item) => {
                if (item.id !== itemId) {
                  return item;
                }

                const nextChecked = !item.checked;
                const previousHistory = Array.isArray(item.contextHistory)
                  ? item.contextHistory
                  : [];
                const incomingHistory = Array.isArray(contextData?.contextHistory)
                  ? contextData.contextHistory
                  : null;
                const previousNote = item.context.trim();
                const nextNote = context.trim();
                const shouldArchivePrevious =
                  previousNote && previousNote !== nextNote && !incomingHistory;
                const nextHistory = shouldArchivePrevious
                  ? [
                      ...(incomingHistory || previousHistory),
                      {
                        note: item.context,
                        createdAt: item.contextCreatedAt || item.createdAt || '',
                        completedAt:
                          item.contextCompletedAt || item.completedAt || '',
                        createdBy: item.contextCreatedBy || item.createdBy || '',
                      },
                    ]
                  : incomingHistory || previousHistory;

                return {
                  ...item,
                  checked: nextChecked,
                  checkedBy: nextChecked ? state.currentUser.role : null,
                  completedAt: nextChecked ? new Date().toISOString() : '',
                  context: context.trim(),
                  contextCreatedAt: nextNote
                    ? contextData?.contextCreatedAt ||
                      (shouldArchivePrevious
                        ? new Date().toISOString()
                        : item.contextCreatedAt || new Date().toISOString())
                    : '',
                  contextCompletedAt: nextChecked ? new Date().toISOString() : '',
                  contextCreatedBy: nextNote
                    ? contextData?.contextCreatedBy ||
                      (shouldArchivePrevious
                        ? state.currentUser.name
                        : item.contextCreatedBy || state.currentUser.name)
                    : '',
                  contextHistory: nextHistory,
                };
              });

              const nextCard = { ...card, checklist: nextChecklist };

              if (!isCardIncomplete(nextCard) && isCardComplete(nextCard)) {
                return {
                  ...nextCard,
                  lane: DONE,
                  completedAt: nextCard.completedAt || new Date().toISOString(),
                };
              }

              return card.lane === DONE
                ? { ...nextCard, lane: ACTIVE, completedAt: '' }
                : nextCard;
            }),
          }));
        },
        moveCard(cardId, targetLane, targetTodoColumnId = '') {
          set((state) => ({
            cards: state.cards.map((card) => {
              if (card.id !== cardId) {
                return card;
              }

              const validTarget =
                targetLane === DONE
                  ? !isCardIncomplete(card) && isCardComplete(card)
                  : targetLane === HOLD
                    ? !isCardIncomplete(card)
                    : targetLane === ACTIVE
                      ? !isCardIncomplete(card)
                  : true;

              return validTarget
                  ? {
                    ...card,
                    lane: targetLane,
                    completedAt:
                      targetLane === DONE
                        ? card.completedAt || new Date().toISOString()
                        : targetLane === ACTIVE
                          ? ''
                          : card.completedAt || '',
                    todoColumnId:
                      targetLane === ACTIVE
                        ? getValidTodoColumnId(
                            state.todoColumns,
                            targetTodoColumnId || card.todoColumnId
                          )
                        : card.todoColumnId,
                  }
                : card;
            }),
          }));
        },
        resetBoard() {
          set(() => {
            const todoColumns = createSeedTodoColumns();

            return {
              todoColumns,
              cards: createSeedCards(todoColumns),
            };
          });
        },
      };
    },
    {
      name: 'tracker-card-board',
      version: 6,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const normalizedBoard = normalizeBoardPayload(persistedState);

        return {
          ...persistedState,
          ...normalizedBoard,
        };
      },
      partialize: (state) => ({
        todoColumns: state.todoColumns,
        cards: state.cards,
        currentUser: state.currentUser,
      }),
    }
  )
);
