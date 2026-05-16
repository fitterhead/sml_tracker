const { randomUUID } = require('node:crypto');

const ACTIVE = 'active';
const TODO_COLUMN_LIMIT = 2;

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
  contextCreatedAt: '',
  contextCompletedAt: '',
  contextHistory: [],
  createdBy,
  ...overrides,
});

const createTodoColumn = (title = 'To Do') => ({
  id: createId(),
  title,
});

const createSeedTodoColumns = () => [
  createTodoColumn('To Do'),
  createTodoColumn('To Do 2'),
];

const normalizeTodoColumns = (todoColumns = []) => {
  const normalized = Array.isArray(todoColumns)
    ? todoColumns
        .slice(0, TODO_COLUMN_LIMIT)
        .map((column, index) => ({
          id: column.id || createId(),
          title: column.title || `To Do ${index + 1}`,
        }))
    : [];

  while (normalized.length < TODO_COLUMN_LIMIT) {
    normalized.push(createTodoColumn(`To Do ${normalized.length + 1}`));
  }

  return normalized;
};

const createSeedCards = (todoColumns = createSeedTodoColumns()) => [
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
    priority: 0,
    order: 1,
    checklist: [createChecklistItem('add checklist item', 'manager')],
  },
];

const createInitialState = () => {
  const todoColumns = createSeedTodoColumns();

  return {
    users: [],
    board: {
      todoColumns,
      cards: createSeedCards(todoColumns),
      updatedAt: new Date().toISOString(),
    },
  };
};

const normalizeChecklistItem = (item = {}) => ({
  id: item.id || createId(),
  text: item.text || 'checklist item',
  checked: Boolean(item.checked),
  checkedBy: item.checkedBy || null,
  createdAt: item.createdAt || item.completedAt || new Date().toISOString(),
  completedAt: item.completedAt || '',
  context: item.context || '',
  contextCreatedAt: item.contextCreatedAt || item.createdAt || '',
  contextCompletedAt: item.contextCompletedAt || '',
  contextHistory: Array.isArray(item.contextHistory) ? item.contextHistory : [],
  createdBy: item.createdBy || 'manager',
});

const normalizeCard = (card = {}, todoColumns = []) => ({
  id: card.id || createId(),
  taskName: card.taskName || '',
  jobName: card.jobName || '',
  assignedPerson: card.assignedPerson || '',
  startDate: card.startDate || '',
  createdAt: card.createdAt || card.startDate || new Date().toISOString(),
  completedAt: card.completedAt || '',
  lane: card.lane || ACTIVE,
  todoColumnId: todoColumns.some((column) => column.id === card.todoColumnId)
    ? card.todoColumnId
    : todoColumns[0]?.id || '',
  priority: Number(card.priority) || 0,
  order: Number(card.order) || 1,
  checklist:
    Array.isArray(card.checklist) && card.checklist.length > 0
      ? card.checklist.map(normalizeChecklistItem)
      : [createChecklistItem('add checklist item', 'manager')],
});

const normalizeBoard = (board = {}) => {
  const todoColumns = normalizeTodoColumns(board.todoColumns);
  const cards =
    Array.isArray(board.cards) && board.cards.length > 0
      ? board.cards.map((card) => normalizeCard(card, todoColumns))
      : createSeedCards(todoColumns);

  return {
    todoColumns,
    cards,
    updatedAt: board.updatedAt || new Date().toISOString(),
  };
};

const normalizeState = (state = {}) => ({
  users: Array.isArray(state.users) ? state.users : [],
  board: normalizeBoard(state.board),
});

module.exports = {
  createInitialState,
  createSeedCards,
  createSeedTodoColumns,
  normalizeBoard,
  normalizeState,
};
