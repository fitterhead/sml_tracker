import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  fetchSession,
  loginRequest,
  registerRequest,
  saveBoardRequest,
} from '../lib/apiClient';

const ACTIVE = 'active';
const DONE = 'done';
const HOLD = 'hold';
const AUTH_STORAGE_KEY = 'tracker-card-auth';

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

const getDefaultUser = () => ({
  id: '',
  name: '',
  email: '',
  role: 'manager',
  isAuthenticated: false,
});

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

const normalizeCards = (cards) => {
  if (!Array.isArray(cards) || cards.length === 0) {
    return createSeedCards();
  }

  return cards.map((card, index) => ({
    id: card.id || createId(),
    taskName: card.taskName || '',
    jobName: card.jobName || '',
    assignedPerson: card.assignedPerson || '',
    startDate: card.startDate || '',
    lane: card.lane || ACTIVE,
    priority: card.priority ?? 0,
    order: card.order ?? index + 1,
    checklist: Array.isArray(card.checklist) && card.checklist.length > 0
      ? card.checklist.map((item) => ({
          id: item.id || createId(),
          text: item.text || '',
          checked: Boolean(item.checked),
          checkedBy: item.checkedBy || null,
          createdAt: item.createdAt || new Date().toISOString(),
          completedAt: item.completedAt || '',
          context: item.context || '',
          contextHistory: Array.isArray(item.contextHistory)
            ? item.contextHistory
            : [],
          createdBy: item.createdBy || 'manager',
        }))
      : [createChecklistItem('Add checklist item', 'manager')],
  }));
};

const setAuthenticatedState = (session, set) => {
  set({
    authToken: session.token,
    currentUser: {
      ...session.user,
      isAuthenticated: true,
    },
    cards: normalizeCards(session.board?.cards),
    authChecked: true,
    isAuthenticating: false,
    authError: '',
    syncError: '',
  });
};

export const useBoardStore = create(
  persist(
    (set, get) => {
      const syncCards = async (cards) => {
        const token = get().authToken;
        if (!token) {
          return;
        }

        set({ isSyncing: true, syncError: '' });

        try {
          await saveBoardRequest(token, cards);
          set({ isSyncing: false, syncError: '' });
        } catch (error) {
          set({
            isSyncing: false,
            syncError: error.message || 'Could not save board changes.',
          });
        }
      };

      const applyCardsUpdate = (updater) => {
        const nextCards = normalizeCards(updater(get().cards));
        set({ cards: nextCards, syncError: '' });
        void syncCards(nextCards);
      };

      return {
        cards: createSeedCards(),
        currentUser: getDefaultUser(),
        authToken: '',
        authChecked: false,
        isAuthenticating: false,
        isSyncing: false,
        authError: '',
        syncError: '',
        async initializeSession() {
          const token = get().authToken;

          if (!token) {
            set({ authChecked: true });
            return;
          }

          set({ isAuthenticating: true, authError: '' });

          try {
            const session = await fetchSession(token);
            setAuthenticatedState(session, set);
          } catch (error) {
            set({
              authToken: '',
              currentUser: getDefaultUser(),
              cards: createSeedCards(),
              authChecked: true,
              isAuthenticating: false,
              authError: error.message || 'Session expired. Please log in again.',
            });
          }
        },
        async login(credentials) {
          set({ isAuthenticating: true, authError: '' });

          try {
            const session = await loginRequest(credentials);
            setAuthenticatedState(session, set);
          } catch (error) {
            set({
              isAuthenticating: false,
              authError: error.message || 'Unable to log in.',
            });
          }
        },
        async register(profile) {
          set({ isAuthenticating: true, authError: '' });

          try {
            const session = await registerRequest(profile);
            setAuthenticatedState(session, set);
          } catch (error) {
            set({
              isAuthenticating: false,
              authError: error.message || 'Unable to create account.',
            });
          }
        },
        logout() {
          set({
            authToken: '',
            currentUser: getDefaultUser(),
            cards: createSeedCards(),
            authChecked: true,
            isAuthenticating: false,
            isSyncing: false,
            authError: '',
            syncError: '',
          });
        },
        clearAuthError() {
          set({ authError: '' });
        },
        bringToFront(cardId) {
          applyCardsUpdate((cards) => bumpCardOrder(cards, cardId));
        },
        createCard(initialValues = {}) {
          applyCardsUpdate((cards) => {
            const highestOrder = getHighestOrder(cards) + 1;
            const userRole = get().currentUser.role;
            const nextNumber = cards.length + 1;
            const taskName =
              initialValues.taskName?.trim() || `Project ${nextNumber}`;
            const jobName =
              initialValues.jobName?.trim() || `Client ${nextNumber}`;

            return [
              ...cards,
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
            ];
          });
        },
        updateCard(cardId, updates) {
          applyCardsUpdate((cards) =>
            cards.map((card) => {
              if (card.id !== cardId) {
                return card;
              }

              const nextCard = { ...card, ...updates };

              if (isCardIncomplete(nextCard)) {
                return { ...nextCard, lane: ACTIVE };
              }

              return nextCard;
            })
          );
        },
        deleteCard(cardId) {
          applyCardsUpdate((cards) => cards.filter((card) => card.id !== cardId));
        },
        addChecklistItem(cardId, input = '') {
          applyCardsUpdate((cards) =>
            cards.map((card) =>
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
                          get().currentUser.role,
                          {
                            context: nextInput.context.trim(),
                          }
                        ),
                      ],
                    };
                  })()
                : card
            )
          );
        },
        toggleChecklistItem(cardId, itemId, context = '') {
          applyCardsUpdate((cards) =>
            cards.map((card) => {
              if (card.id !== cardId || card.lane === HOLD) {
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
                  checkedBy: nextChecked ? get().currentUser.role : null,
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
            })
          );
        },
        moveCard(cardId, targetLane) {
          applyCardsUpdate((cards) =>
            cards.map((card) => {
              if (card.id !== cardId) {
                return card;
              }

              const validTarget =
                targetLane === DONE
                  ? !isCardIncomplete(card) && isCardComplete(card)
                  : true;

              return validTarget ? { ...card, lane: targetLane } : card;
            })
          );
        },
        resetBoard() {
          const nextCards = createSeedCards();
          set({ cards: nextCards, syncError: '' });
          void syncCards(nextCards);
        },
      };
    },
    {
      name: AUTH_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        authToken: state.authToken,
      }),
    }
  )
);
