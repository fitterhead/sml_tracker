export const STACK_LIMIT = 5;
export const TODO_STACK_LIMIT = 20;
export const COMPACT_STACK_LIMIT = 6;

export const columnMeta = {
  active: {
    title: 'to do',
    subtitle: 'ready to work',
  },
  done: {
    title: 'finish',
    subtitle: 'completed clients',
  },
  hold: {
    title: 'on hold',
    subtitle: 'paused for now',
  },
  incomplete: {
    title: 'project needs more information',
    subtitle: 'missing required project or client information',
  },
};

export const formatCardAge = (value) => {
  if (!value) {
    return 'today';
  }

  const createdDate = new Date(value);

  if (Number.isNaN(createdDate.getTime())) {
    return 'today';
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const dayCount = Math.max(0, Math.floor((Date.now() - createdDate.getTime()) / dayMs));

  if (dayCount === 0) {
    return 'today';
  }

  if (dayCount < 30) {
    return `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;
  }

  const monthCount = Math.floor(dayCount / 30);

  if (monthCount < 12) {
    return `${monthCount} ${monthCount === 1 ? 'month' : 'months'}`;
  }

  const yearCount = Math.floor(monthCount / 12);
  return `${yearCount} ${yearCount === 1 ? 'year' : 'years'}`;
};

export const formatCompletedDate = (value) => {
  if (!value) {
    return 'not complete';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
};

export const formatChecklistTimeline = (item) => {
  const createdValue = item.createdAt || item.completedAt || '';
  const completedValue = item.completedAt || '';

  if (!createdValue) {
    return '';
  }

  const createdDate = new Date(createdValue);
  const completedDate = completedValue ? new Date(completedValue) : null;

  const createdShort = new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
  }).format(createdDate);

  if (!completedDate) {
    return new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(createdDate);
  }

  const sameYear = createdDate.getFullYear() === completedDate.getFullYear();
  const completedText = new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(completedDate);

  if (sameYear) {
    return `${createdShort} - ${completedText}`;
  }

  return `${formatCompletedDate(createdValue)} - ${completedText}`;
};

export const formatContextHistoryTimeline = (entry) => {
  if (!entry?.createdAt) {
    return '';
  }

  const createdDate = new Date(entry.createdAt);
  const completedDate = entry.completedAt ? new Date(entry.completedAt) : null;

  const formatShortDateTime = (value, includeYear = false) =>
    new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {}),
      hour: 'numeric',
      minute: '2-digit',
    }).format(value);

  if (!completedDate) {
    return formatShortDateTime(createdDate, true);
  }

  const sameYear = createdDate.getFullYear() === completedDate.getFullYear();
  return `${formatShortDateTime(createdDate, !sameYear)} - ${formatShortDateTime(
    completedDate,
    true
  )}`;
};

export const getStackLimit = (lane) => {
  if (lane === 'active') {
    return TODO_STACK_LIMIT;
  }

  if (lane === 'done' || lane === 'hold') {
    return COMPACT_STACK_LIMIT;
  }

  return STACK_LIMIT;
};

export const getPileLayout = (lane, visibleCount, index) => {
  const compression = Math.min(Math.max(visibleCount - 5, 0), 15);
  const isCompactStack = lane === 'done' || lane === 'hold';
  const shouldLimitSpread = lane === 'active' || lane === 'done' || lane === 'hold';
  const maxPileSpread = 32;
  const naturalXStep = Math.max(12, 34 - compression);
  const xStep = shouldLimitSpread
    ? Math.max(
        3,
        Math.min(naturalXStep, maxPileSpread / Math.max(visibleCount - 1, 1))
      )
    : naturalXStep;
  const yStep = isCompactStack
    ? Math.max(22, 30 - compression)
    : Math.max(14, 42 - compression * 1.4);
  const scale = 1;

  return {
    x: index * xStep,
    y: index * yStep,
    scale,
  };
};

export const getPileHeight = (lane, visibleCount) => {
  if (visibleCount === 0) {
    return lane === 'done' || lane === 'hold' ? 24 : 420;
  }

  const { y, scale } = getPileLayout(lane, visibleCount, visibleCount - 1);
  const cardHeight = lane === 'active' ? 316 : 86;
  const breathingRoom = lane === 'active' ? 12 : 24;
  const naturalHeight = Math.ceil(y + cardHeight * scale + breathingRoom);

  if (lane === 'done' || lane === 'hold') {
    return naturalHeight;
  }

  return Math.max(420, naturalHeight);
};

export const buildTodoSectionId = (todoColumnId) => `active:${todoColumnId}`;

export const isValidDropLane = (lane) =>
  lane === 'active' || lane === 'done' || lane === 'hold' || lane === 'incomplete';

export const parseDropTarget = (value) => {
  if (typeof value !== 'string') {
    return { lane: '', todoColumnId: '' };
  }

  if (value.startsWith('active:')) {
    return {
      lane: 'active',
      todoColumnId: value.slice('active:'.length),
    };
  }

  return {
    lane: value,
    todoColumnId: '',
  };
};

export const getVisibleTodoColumnId = (todoColumns, todoColumnId) =>
  todoColumns.some((column) => column.id === todoColumnId)
    ? todoColumnId
    : todoColumns[0]?.id || '';
