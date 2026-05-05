import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const ACTIVE = 'active';
const DONE = 'done';
const HOLD = 'hold';

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
  contextHistory: [],
  createdBy,
  ...overrides,
});

export const createSeedCards = () => [
  {
    id: createId(),
    taskName: '',
    jobName: '',
    assignedPerson: '',
    startDate: '',
    lane: ACTIVE,
    priority: 0,
    order: 1,
    checklist: [createChecklistItem('Add checklist item', 'manager')],
  },
];

const getHighestOrder = (cards) =>
  cards.reduce((max, card) => Math.max(max, card.order ?? 0), 0);

export const isCardIncomplete = (card) =>
  !card.taskName.trim() || !card.jobName.trim();

export const getMissingFields = (card) => {
  const missing = [];

  if (!card.taskName.trim()) {
    missing.push('Project name');
  }

  if (!card.jobName.trim()) {
    missing.push('Client name');
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

export const useBoardStore = create(
  persist(
    (set, get) => ({
      cards: createSeedCards(),
      currentUser: {
        name: 'Andrew',
        role: 'manager',
        isAuthenticated: true,
      },
      setRole(role) {
        set((state) => ({
          currentUser: {
            ...state.currentUser,
            role,
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
          const taskName = initialValues.taskName?.trim() || `Project ${nextNumber}`;
          const jobName = initialValues.jobName?.trim() || `Client ${nextNumber}`;

          return {
            cards: [
              ...state.cards,
              {
                id: createId(),
                taskName,
                jobName,
                assignedPerson: initialValues.assignedPerson?.trim() || '',
                startDate: initialValues.startDate || '',
                lane: initialValues.lane || ACTIVE,
                priority: initialValues.priority ?? 0,
                order: highestOrder,
                checklist: [
                  createChecklistItem('Add first checklist item', userRole),
                ],
              },
            ],
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
      deleteCard(cardId) {
        set((state) => {
          const nextCards = state.cards.filter((card) => card.id !== cardId);

          return {
            cards: nextCards.length > 0 ? nextCards : createSeedCards(),
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
                    checklist: [
                      ...card.checklist,
                      createChecklistItem(
                        nextInput.text || 'New checklist item',
                        state.currentUser.role,
                        {
                          context: nextInput.context.trim(),
                        }
                      ),
                    ],
                  };
                })()
              : card
          ),
        }));
      },
      toggleChecklistItem(cardId, itemId, context = '') {
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
              const previousNote = item.context.trim();
              const nextNote = context.trim();
              const shouldArchivePrevious =
                previousNote && previousNote !== nextNote;
              const nextHistory = shouldArchivePrevious
                ? [
                    ...previousHistory,
                    {
                      note: item.context,
                      createdAt: item.createdAt || '',
                      completedAt: item.completedAt || '',
                    },
                  ]
                : previousHistory;

              return {
                ...item,
                checked: nextChecked,
                checkedBy: nextChecked ? state.currentUser.role : null,
                completedAt: nextChecked ? new Date().toISOString() : '',
                context: context.trim(),
                contextHistory: nextHistory,
              };
            });

            const nextCard = { ...card, checklist: nextChecklist };

            if (!isCardIncomplete(nextCard) && isCardComplete(nextCard)) {
              return { ...nextCard, lane: DONE };
            }

            return nextCard;
          }),
        }));
      },
      moveCard(cardId, targetLane) {
        set((state) => ({
          cards: state.cards.map((card) => {
            if (card.id !== cardId) {
              return card;
            }

            const validTarget =
              targetLane === DONE
                ? !isCardIncomplete(card) && isCardComplete(card)
                : true;

            return validTarget ? { ...card, lane: targetLane } : card;
          }),
        }));
      },
      resetBoard() {
        set(() => ({
          cards: createSeedCards(),
        }));
      },
    }),
    {
      name: 'tracker-card-board',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cards: state.cards,
        currentUser: state.currentUser,
      }),
    }
  )
);
