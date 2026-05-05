const { randomUUID } = require('node:crypto');

const ACTIVE = 'active';

const createId = () => {
  if (typeof randomUUID === 'function') {
    return randomUUID();
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

const createSeedCards = () => [
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

const createInitialState = () => ({
  users: [],
  board: {
    cards: createSeedCards(),
    updatedAt: new Date().toISOString(),
  },
});

const normalizeState = (state = {}) => ({
  users: Array.isArray(state.users) ? state.users : [],
  board: {
    cards:
      Array.isArray(state.board?.cards) && state.board.cards.length > 0
        ? state.board.cards
        : createSeedCards(),
    updatedAt: state.board?.updatedAt || new Date().toISOString(),
  },
});

module.exports = {
  createInitialState,
  createSeedCards,
  normalizeState,
};
