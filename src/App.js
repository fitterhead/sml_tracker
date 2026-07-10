import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import * as XLSX from 'xlsx';
import './App.css';
import {
  AllCardsPage,
  BoardLayout,
  IncompletePage,
} from './components/BoardViews';
import {
  columnMeta,
  formatCardAge,
  formatCardDisplayDate,
  formatChecklistTimeline,
  formatContextHistoryTimeline,
  getPileHeight,
  getPileLayout,
  getStackLimit,
  getVisibleTodoColumnId,
  isValidDropLane,
  parseDropTarget,
} from './boardConfig';
import Header from './components/Header';
import {
  fetchSession,
  loginRequest,
  registerRequest,
  saveBoardRequest,
} from './lib/apiClient';
import {
  getCurrentUserPreferenceKey,
  getDefaultUserPreferences,
  getCardZone,
  isCardComplete,
  getMissingFields,
  normalizePreferences,
  useBoardStore,
} from './store/useBoardStore';

const AUTH_TOKEN_KEY = 'sml-tracker-auth-token';
const CHECKLIST_STATES = {
  UNCHECKED: 'unchecked',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};
const CHECKLIST_ITEM_TYPES = {
  TASK: 'task',
  COMPLETION: 'completion',
};
const SORT_OPTIONS = [
  { value: 'client-az', label: 'Sort by client name A -> Z' },
  { value: 'client-za', label: 'Sort by client name Z -> A' },
  { value: 'priority-high', label: 'Sort by priority high to front' },
  { value: 'priority-low', label: 'Sort by priority low to front' },
  { value: 'created-newest', label: 'Sort by created date newest -> oldest' },
  { value: 'created-oldest', label: 'Sort by created date oldest -> newest' },
];
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const TORONTO_TIME_ZONE = 'America/Toronto';
const STATUS_DROP_INTENT_LANES = new Set(['done', 'hold']);
const DRAG_OVERLAY_MODIFIERS = [
  ({ transform, activatorEvent, draggingNodeRect }) => {
    if (!activatorEvent || !draggingNodeRect || !('clientX' in activatorEvent)) {
      return transform;
    }

    return {
      ...transform,
      x:
        transform.x +
        activatorEvent.clientX -
        draggingNodeRect.left -
        draggingNodeRect.width / 2,
      y:
        transform.y +
        activatorEvent.clientY -
        draggingNodeRect.top -
        Math.min(42, draggingNodeRect.height / 3),
    };
  },
];

const readStoredAuthToken = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
};

const getSortableClientName = (card) => (card.jobName || '').trim().toLowerCase();

const getSortableCreatedTime = (card) => {
  const value = card.createdAt || card.startDate || '';
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const getSortablePriority = (card) => Number(card.priority) || 1;

const createCardSorter = (sortMode) => (a, b) => {
  if (sortMode === 'client-az' || sortMode === 'client-za') {
    const direction = sortMode === 'client-az' ? 1 : -1;
    const nameCompare = getSortableClientName(a).localeCompare(getSortableClientName(b));
    return nameCompare ? nameCompare * direction : a.order - b.order;
  }

  if (sortMode === 'priority-high' || sortMode === 'priority-low') {
    const direction = sortMode === 'priority-high' ? 1 : -1;
    const priorityCompare = getSortablePriority(a) - getSortablePriority(b);
    return priorityCompare ? priorityCompare * direction : a.order - b.order;
  }

  if (sortMode === 'created-newest' || sortMode === 'created-oldest') {
    const direction = sortMode === 'created-newest' ? -1 : 1;
    const timeCompare = getSortableCreatedTime(a) - getSortableCreatedTime(b);
    return timeCompare ? timeCompare * direction : a.order - b.order;
  }

  return a.order - b.order;
};

const moveCardToVisualFront = (cards, frontCardId) => {
  if (!frontCardId) {
    return cards;
  }

  const frontCard = cards.find((card) => card.id === frontCardId);
  if (!frontCard) {
    return cards;
  }

  return [
    ...cards.filter((card) => card.id !== frontCardId),
    frontCard,
  ];
};

const sortGroupedLanes = (grouped, sortMode, frontCardId = '') => {
  const sorter = createCardSorter(sortMode);
  const sortedActiveByColumn = Object.fromEntries(
    Object.entries(grouped.activeByColumn).map(([columnId, columnCards]) => [
      columnId,
      moveCardToVisualFront([...columnCards].sort(sorter), frontCardId),
    ])
  );

  return {
    activeByColumn: sortedActiveByColumn,
    done: moveCardToVisualFront([...grouped.done].sort(sorter), frontCardId),
    hold: moveCardToVisualFront([...grouped.hold].sort(sorter), frontCardId),
    incomplete: moveCardToVisualFront([...grouped.incomplete].sort(sorter), frontCardId),
  };
};

const createEmptyServerMeta = () => ({
  lastLoginAt: '',
  cardsCreatedToday: 0,
  changesToday: 0,
  boardUpdatedAt: '',
  usersCount: 0,
  cardsCount: 0,
});

const getTimeZoneOffsetMinutes = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const offsetName = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = offsetName.match(/^GMT([+-])?(\d{1,2})?(?::(\d{2}))?$/);

  if (!match || !match[1]) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
};

const getVietnamDayPeriod = (date) => {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: VIETNAM_TIME_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date)
  );

  if (hour >= 5 && hour < 11) {
    return 'morning';
  }

  if (hour >= 11 && hour < 14) {
    return 'midday';
  }

  if (hour >= 14 && hour < 18) {
    return 'afternoon';
  }

  if (hour >= 18 && hour < 23) {
    return 'evening';
  }

  return 'late night';
};

const formatVietnamTime = (date) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: VIETNAM_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

const formatTorontoDifference = (date) => {
  const vietnamOffset = getTimeZoneOffsetMinutes(date, VIETNAM_TIME_ZONE);
  const torontoOffset = getTimeZoneOffsetMinutes(date, TORONTO_TIME_ZONE);
  const differenceHours = (vietnamOffset - torontoOffset) / 60;
  const absoluteHours = Math.abs(differenceHours);
  const formattedHours = Number.isInteger(absoluteHours)
    ? absoluteHours
    : absoluteHours.toFixed(1);
  const direction = differenceHours >= 0 ? 'ahead of' : 'behind';

  return `${formattedHours}h ${direction} toronto`;
};
const EXPORT_FIELDS = [
  { key: 'taskName', label: 'project name' },
  { key: 'jobName', label: 'client name' },
  { key: 'lane', label: 'lane' },
  { key: 'priority', label: 'priority' },
  { key: 'startDate', label: 'start date' },
  { key: 'checklistText', label: 'checklist item' },
  { key: 'checklistChecked', label: 'checked' },
  { key: 'checklistCompletedAt', label: 'completed at' },
  { key: 'checklistContext', label: 'checklist context' },
  { key: 'checkedBy', label: 'checked by' },
  { key: 'createdBy', label: 'created by' },
];
const IMPORT_HEADER_ALIASES = {
  taskName: ['project name', 'project', 'task name', 'task', 'job', 'job name'],
  jobName: ['client name', 'client', 'customer', 'company'],
  assignedPerson: ['assigned person', 'assigned', 'person', 'owner'],
  startDate: ['start date', 'date', 'created date'],
  lane: ['lane', 'status', 'column'],
  priority: ['priority'],
  checklistText: ['checklist item', 'checklist', 'todo', 'to do', 'item'],
  checklistChecked: ['checked', 'complete', 'completed', 'done'],
  checklistCompletedAt: ['completed at', 'checklist completed at'],
  checklistContext: ['checklist context', 'context', 'note', 'notes'],
  checkedBy: ['checked by'],
  createdBy: ['created by'],
};

const normalizeImportHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getImportValue = (row, field) => {
  const aliases = IMPORT_HEADER_ALIASES[field] || [field];
  const foundKey = Object.keys(row).find((key) =>
    aliases.includes(normalizeImportHeader(key))
  );

  return foundKey ? row[foundKey] : '';
};

const normalizeImportedDate = (value) => {
  if (!value) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const raw = String(value).trim();
  const parsedDate = new Date(raw);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return raw;
};

const normalizeImportedLane = (value) => {
  const lane = normalizeImportHeader(value);

  if (['finish', 'finished', 'done', 'completed'].includes(lane)) {
    return 'done';
  }

  if (['hold', 'on hold', 'paused'].includes(lane)) {
    return 'hold';
  }

  return 'active';
};

const normalizeImportedBoolean = (value) => {
  const normalized = normalizeImportHeader(value);
  return ['yes', 'true', '1', 'done', 'complete', 'completed', 'checked'].includes(normalized);
};

const buildCardsFromImportedRows = (rows) => {
  const grouped = new Map();

  rows.forEach((row, index) => {
    const taskName = String(getImportValue(row, 'taskName') || '').trim();
    const jobName = String(getImportValue(row, 'jobName') || '').trim();
    const assignedPerson = String(getImportValue(row, 'assignedPerson') || '').trim();
    const startDate = normalizeImportedDate(getImportValue(row, 'startDate'));
    const lane = normalizeImportedLane(getImportValue(row, 'lane'));
    const priority = Number(getImportValue(row, 'priority')) || 1;
    const checklistText = String(getImportValue(row, 'checklistText') || '').trim();
    const checklistContext = String(getImportValue(row, 'checklistContext') || '').trim();
    const key = [jobName, taskName, assignedPerson, startDate, lane, priority].join('|') || `row-${index}`;

    if (!taskName && !jobName && !checklistText) {
      return;
    }

    if (!grouped.has(key)) {
      grouped.set(key, {
        taskName,
        jobName,
        assignedPerson,
        startDate,
        lane,
        priority,
        checklist: [],
      });
    }

    if (checklistText) {
      grouped.get(key).checklist.push({
        text: checklistText,
        context: checklistContext,
        checked: normalizeImportedBoolean(getImportValue(row, 'checklistChecked')),
        checkedBy: String(getImportValue(row, 'checkedBy') || '').trim(),
        completedAt: normalizeImportedDate(getImportValue(row, 'checklistCompletedAt')),
        createdBy: String(getImportValue(row, 'createdBy') || '').trim(),
      });
    }
  });

  return [...grouped.values()];
};

const buildDraftFromCard = (card) => ({
  taskName: card.taskName,
  jobName: card.jobName,
  assignedPerson: card.assignedPerson,
  startDate: card.startDate,
  checklist: card.checklist.map((item) => ({
    ...item,
    createdAt: item.createdAt || item.completedAt || new Date().toISOString(),
    context: item.context || '',
    contextCreatedAt:
      item.contextCreatedAt || item.createdAt || item.completedAt || '',
    contextCompletedAt: item.contextCompletedAt || '',
    contextCreatedBy: item.contextCreatedBy || item.createdBy || '',
    contextHistory: item.contextHistory || [],
  })),
  priority: card.priority || 1,
});

const triggerActionOnEnter = (event, action) => {
  if (event.key !== 'Enter' || event.shiftKey) {
    return;
  }

  event.preventDefault();
  action();
};

const isEditableControl = (target) => {
  if (!target) {
    return false;
  }

  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  );
};

const selectEditableText = (event) => {
  const field = event.currentTarget;

  window.requestAnimationFrame(() => {
    field.select?.();
  });
};

const blurActiveInput = () => {
  if (
    typeof document !== 'undefined' &&
    typeof HTMLElement !== 'undefined' &&
    document.activeElement instanceof HTMLElement
  ) {
    document.activeElement.blur();
  }
};

const hasTextValueChanged = (nextValue = '', savedValue = '') =>
  String(nextValue) !== String(savedValue);

function useUnsavedChangesWarning(hasUnsavedChanges) {
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined;
    }

    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
    };
  }, [hasUnsavedChanges]);
}

const getChecklistCreatedTime = (item = {}) => {
  const value = item.createdAt || item.completedAt || '';
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const sortChecklistNewestFirst = (checklist = []) =>
  [...checklist].sort((a, b) => getChecklistCreatedTime(b) - getChecklistCreatedTime(a));

const isCompletionChecklistItem = (item = {}) =>
  item.type === CHECKLIST_ITEM_TYPES.COMPLETION;

const isActiveChecklistItem = (item = {}) =>
  !isCompletionChecklistItem(item) && !item.archivedInCompletionId;

const getActiveChecklistItems = (checklist = []) =>
  checklist.filter(isActiveChecklistItem);

const formatPhaseDate = (value = '') => {
  if (!value) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10).replaceAll('-', '/');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('-', '/');
};

const getPhaseDurationDays = (startValue = '', endValue = '') => {
  const parseDateTime = (value) => {
    if (!value) {
      return Number.NaN;
    }

    return new Date(
      /^\d{4}-\d{2}-\d{2}/.test(value)
        ? `${value.slice(0, 10)}T00:00:00`
        : value
    ).getTime();
  };
  const startTime = parseDateTime(startValue);
  const endTime = parseDateTime(endValue);

  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return null;
  }

  return Math.max(0, Math.round((endTime - startTime) / 86400000));
};

const formatCompletionPhaseLabel = (item = {}) => {
  const durationDays = getPhaseDurationDays(item.createdAt, item.completedAt);
  const durationText = durationDays === null
    ? ''
    : ` (${durationDays} ${durationDays === 1 ? 'day' : 'days'})`;

  return [
    `phase ${item.phaseNumber || 1}:`,
    formatPhaseDate(item.createdAt),
    '-',
    formatPhaseDate(item.completedAt),
  ]
    .filter(Boolean)
    .join(' ')
    .concat(durationText);
};

const getChecklistContextHistory = (item = {}) =>
  Array.isArray(item.contextHistory) ? item.contextHistory : [];

const hasChecklistContext = (item = {}) =>
  Boolean(item?.context?.trim()) || getChecklistContextHistory(item).length > 0;

const getChecklistContextPreview = (item = {}) => {
  const currentContext = item?.context?.trim();
  if (currentContext) {
    return currentContext;
  }

  const history = getChecklistContextHistory(item);
  return history[history.length - 1]?.note || '';
};

const getContextActor = (user = {}) =>
  user.name || user.email || user.role || 'unknown';

const addContextToChecklistItem = (item = {}, noteValue = '', actor = '') => {
  const note = String(noteValue || '').trim();

  if (!note) {
    return item;
  }

  if (item.context?.trim() === note) {
    return item;
  }

  const previousContext = item.context?.trim()
    ? [
        {
          note: item.context,
          createdAt:
            item.contextCreatedAt ||
            item.createdAt ||
            new Date().toISOString(),
          completedAt: item.contextCompletedAt || item.completedAt || '',
          createdBy: item.contextCreatedBy || item.createdBy || actor,
        },
      ]
    : [];

  return {
    ...item,
    context: note,
    contextCreatedAt: new Date().toISOString(),
    contextCompletedAt: '',
    contextCreatedBy: actor,
    contextHistory: [
      ...getChecklistContextHistory(item),
      ...previousContext,
    ],
  };
};

const deleteCurrentChecklistContext = (item = {}) => ({
  ...item,
  context: '',
  contextCreatedAt: '',
  contextCompletedAt: '',
  contextCreatedBy: '',
});

const deleteChecklistHistoryContext = (item = {}, historyIndexFromNewest) => {
  const history = getChecklistContextHistory(item);
  const actualIndex = history.length - 1 - historyIndexFromNewest;

  return {
    ...item,
    contextHistory: history.filter((_, index) => index !== actualIndex),
  };
};

function HighlightedText({ text = '' }) {
  return String(text);
}

function ContextMeta({ entry = {}, fallback = 'saved context' }) {
  const timeline = formatContextHistoryTimeline(entry) || fallback;
  const actor = entry.contextCreatedBy || entry.createdBy || entry.updatedBy || '';

  return (
    <span className="context-entry-date">
      {timeline}
      {actor ? ` by ${actor}` : ''}
    </span>
  );
}

function ContextSummary({ item }) {
  if (!hasChecklistContext(item)) {
    return null;
  }

  const history = getChecklistContextHistory(item);
  const latest = item?.context?.trim()
    ? {
        note: item.context,
        createdAt: item.contextCreatedAt || item.createdAt || '',
        completedAt: item.contextCompletedAt || item.completedAt || '',
        createdBy: item.contextCreatedBy || item.createdBy || '',
      }
    : history[history.length - 1];

  if (!latest?.note?.trim()) {
    return null;
  }

  return (
    <div className="context-summary">
      <ContextMeta entry={latest} fallback="latest context" />
      <p>
        <HighlightedText text={latest.note} />
      </p>
    </div>
  );
}

function ContextActionButton({
  open,
  hasContext = false,
  onClick,
  className = '',
  disabled = false,
}) {
  const label = open ? '− context' : hasContext ? '+ context' : '+ add context';

  return (
    <button
      type="button"
      className={`context-action-button ${className}`.trim()}
      aria-label={hasContext ? 'context' : 'add context'}
      title={hasContext ? 'context' : 'add context'}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function ContextThreadEditor({
  item,
  inputValue,
  onInputChange,
  onAddContext,
  onDeleteCurrentContext,
  onDeleteHistoryContext,
}) {
  const historyEntries = getChecklistContextHistory(item);
  const hasContext = hasChecklistContext(item);
  const contextInputRef = useRef(null);
  const skipContextBlurPromptRef = useRef(false);
  const savingContextRef = useRef(false);
  const [showContextUnsavedPrompt, setShowContextUnsavedPrompt] = useState(false);
  const hasPendingContextInput = Boolean(String(inputValue || '').trim());
  useUnsavedChangesWarning(hasPendingContextInput);

  const saveContextInput = () => {
    if (savingContextRef.current) {
      return;
    }

    savingContextRef.current = true;
    skipContextBlurPromptRef.current = true;
    if (String(inputValue || '').trim()) {
      onAddContext();
    }
    setShowContextUnsavedPrompt(false);
    contextInputRef.current?.blur();
    window.setTimeout(() => {
      skipContextBlurPromptRef.current = false;
      savingContextRef.current = false;
    });
  };

  const discardContextInput = () => {
    onInputChange('');
    setShowContextUnsavedPrompt(false);
  };

  const cancelContextExit = () => {
    setShowContextUnsavedPrompt(false);
    window.requestAnimationFrame(() => contextInputRef.current?.focus());
  };

  const requestContextExit = () => {
    if (skipContextBlurPromptRef.current) {
      return;
    }

    if (hasPendingContextInput) {
      setShowContextUnsavedPrompt(true);
    }
  };

  return (
    <div className="modal-check-context">
      <div className="context-composer">
        <label className="field field-full modal-check-context-field">
          <span>new context</span>
          <textarea
            ref={contextInputRef}
            value={inputValue || ''}
            onChange={(event) => onInputChange(event.target.value)}
            onFocus={selectEditableText}
            onBlur={requestContextExit}
            onKeyDown={(event) => triggerActionOnEnter(event, saveContextInput)}
            rows={2}
            placeholder="type a context note"
          />
        </label>
        <button
          type="button"
          className="ghost-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={saveContextInput}
        >
          add context
        </button>
      </div>
      <div className="check-context-body">
        {item?.context?.trim() ? (
          <div className="context-entry">
            <div className="context-entry-head">
              <ContextMeta
                entry={{
                  createdAt: item.contextCreatedAt || item.createdAt || '',
                  completedAt: item.contextCompletedAt || item.completedAt || '',
                  createdBy: item.contextCreatedBy || item.createdBy || '',
                }}
                fallback="latest context"
              />
              {onDeleteCurrentContext ? (
                <button
                  type="button"
                  className="ghost-button muted context-delete-button"
                  onClick={onDeleteCurrentContext}
                >
                  delete
                </button>
              ) : null}
            </div>
            <p className="context-entry-note">
              <HighlightedText text={item.context} />
            </p>
          </div>
        ) : null}
        {historyEntries
          .slice()
          .reverse()
          .map((entry, index) => (
            <div
              className="context-entry context-entry-history"
              key={`${entry.createdAt}-${entry.completedAt}-${index}`}
            >
              <div className="context-entry-head">
                <ContextMeta entry={entry} fallback="saved context" />
                {onDeleteHistoryContext ? (
                  <button
                    type="button"
                    className="ghost-button muted context-delete-button"
                    onClick={() => onDeleteHistoryContext(index)}
                  >
                    delete
                  </button>
                ) : null}
              </div>
              <p className="context-entry-note">
                <HighlightedText text={entry.note || ''} />
              </p>
            </div>
          ))}
        {!hasContext ? <p className="context-empty">no context yet</p> : null}
      </div>
      <UnsavedChangesModal
        open={showContextUnsavedPrompt}
        onSave={saveContextInput}
        onDiscard={discardContextInput}
        onCancel={cancelContextExit}
      />
    </div>
  );
}

function PriorityDots({ value = 0, onChange }) {
  const dotColors = ['#1fa34a', '#5aa93f', '#d0a11a', '#f26432', '#ff2b2b'];

  return (
    <div className="priority-dots">
      {Array.from({ length: 5 }, (_, index) => {
        const level = index + 1;
        const filled = level <= value;

        return (
          <button
            key={level}
            type="button"
            className={`priority-dot ${filled ? 'filled' : ''}`}
            style={{ '--dot-color': dotColors[index] }}
            onClick={(event) => {
              event.stopPropagation();
              onChange(level);
            }}
            aria-label={`set priority ${level}`}
          />
        );
      })}
    </div>
  );
}

function ChecklistConfirmModal({
  open,
  nextChecked,
  nextState,
  itemText,
  contextItem,
  contextInput,
  onContextInputChange,
  onAddContext,
  onDeleteCurrentContext,
  onDeleteHistoryContext,
  onConfirm,
  onCancel,
}) {
  const [showContextField, setShowContextField] = useState(() =>
    Boolean(
      open &&
        (contextItem?.context?.trim() ||
          getChecklistContextHistory(contextItem).length > 0)
    )
  );

  if (!open) {
    return null;
  }

  const actionText =
    nextState === CHECKLIST_STATES.IN_PROGRESS
      ? 'mark this item as in progress?'
      : nextState === CHECKLIST_STATES.COMPLETED || nextChecked
        ? 'mark this item completed and reviewed?'
        : 'reset this item to unchecked?';
  const eyebrow =
    nextState === CHECKLIST_STATES.IN_PROGRESS
      ? 'confirm progress'
      : nextState === CHECKLIST_STATES.COMPLETED || nextChecked
        ? 'confirm review'
        : 'confirm reset';

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
            event.preventDefault();
            onConfirm();
          }
        }}
      >
        <p className="eyebrow">{eyebrow}</p>
        <h2>{actionText}</h2>
        <p className="confirm-item-text">
          <HighlightedText text={itemText || ''} />
        </p>
        <ContextActionButton
          open={showContextField}
          hasContext={hasChecklistContext(contextItem)}
          onClick={() => setShowContextField((current) => !current)}
        />
        {showContextField ? (
          <ContextThreadEditor
            item={contextItem}
            inputValue={contextInput}
            onInputChange={onContextInputChange}
            onAddContext={onAddContext}
            onDeleteCurrentContext={onDeleteCurrentContext}
            onDeleteHistoryContext={onDeleteHistoryContext}
          />
        ) : null}
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
          <button type="button" className="ghost-button" onClick={onConfirm}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

function ExportConfigModal({
  open,
  columns,
  importStatus,
  onToggleColumn,
  onMoveColumn,
  onClose,
  onExport,
  onImportFile,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onClose}>
      <div
        className="export-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">excel tools</p>
        <h2>export or create cards</h2>
        <div className="excel-tools-grid">
          <section className="excel-panel">
            <div className="excel-panel-head">
              <div>
                <span className="eyebrow">export</span>
                <p>choose columns and order for your spreadsheet</p>
              </div>
              <button type="button" className="ghost-button" onClick={onExport}>
                export file
              </button>
            </div>
            <div className="export-table">
              <div className="export-table-head">
                <span>use</span>
                <span>column</span>
                <span>move</span>
              </div>
              {columns.map((column, index) => (
                <div className="export-table-row" key={column.key}>
                  <label className="export-check">
                    <input
                      type="checkbox"
                      checked={column.enabled}
                      onChange={() => onToggleColumn(column.key)}
                    />
                    <span />
                  </label>
                  <span className="export-column-label">{column.label}</span>
                  <div className="export-order-actions">
                    <button
                      type="button"
                      className="ghost-button muted"
                      onClick={() => onMoveColumn(index, -1)}
                      disabled={index === 0}
                    >
                      up
                    </button>
                    <button
                      type="button"
                      className="ghost-button muted"
                      onClick={() => onMoveColumn(index, 1)}
                      disabled={index === columns.length - 1}
                    >
                      down
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="excel-panel import-panel">
            <div className="excel-panel-head">
              <div>
                <span className="eyebrow">import</span>
                <p>upload excel to create cards in to do</p>
              </div>
            </div>
            <label className="excel-dropzone">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={onImportFile}
              />
              <span>choose excel file</span>
              <small>supports project name, client name, start date, priority, lane, checklist item, context</small>
            </label>
            {importStatus ? (
              <p className={`import-status ${importStatus.type || ''}`}>
                {importStatus.message}
              </p>
            ) : null}
          </section>
        </div>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function ReopenDoneCardModal({ open, onConfirm, onCancel }) {
  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">create new checklist</p>
        <h2>this card is already complete</h2>
        <p className="confirm-item-text">
          to move it back to to do, create a new checklist item first.
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            add checklist item
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteChecklistModal({ open, itemText, onConfirm, onCancel }) {
  const confirmButtonRef = useRef(null);

  const confirmDelete = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onConfirm();
  }, [onConfirm]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    window.requestAnimationFrame(() => confirmButtonRef.current?.focus());

    const confirmOnEnter = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
        return;
      }

      confirmDelete(event);
    };

    window.addEventListener('keydown', confirmOnEnter, true);
    return () => window.removeEventListener('keydown', confirmOnEnter, true);
  }, [confirmDelete, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
            return;
          }

          confirmDelete(event);
        }}
      >
        <p className="eyebrow">delete checklist item</p>
        <h2>do you want to delete this item?</h2>
        <p className="confirm-item-text">
          <HighlightedText text={itemText || ''} />
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="ghost-button"
            onClick={confirmDelete}
          >
            delete
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteCardModal({ open, cardTitle, onConfirm, onCancel }) {
  const confirmButtonRef = useRef(null);

  const confirmDelete = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onConfirm();
  }, [onConfirm]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    window.requestAnimationFrame(() => confirmButtonRef.current?.focus());

    const confirmOnEnter = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
        return;
      }

      confirmDelete(event);
    };

    window.addEventListener('keydown', confirmOnEnter, true);
    return () => window.removeEventListener('keydown', confirmOnEnter, true);
  }, [confirmDelete, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
            return;
          }

          confirmDelete(event);
        }}
      >
        <p className="eyebrow">delete card</p>
        <h2>do you want to delete this card?</h2>
        <p className="confirm-item-text">
          <HighlightedText text={cardTitle || ''} />
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="ghost-button"
            onClick={confirmDelete}
          >
            delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmMoveToHoldModal({ open, cardTitle, onConfirm, onCancel }) {
  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">on hold</p>
        <h2>Move this card to On Hold?</h2>
        <p className="confirm-item-text">
          <HighlightedText text={cardTitle || 'untitled card'} />
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function CompletionArchiveWarningModal({ open, itemCount, onConfirm, onCancel }) {
  const confirmButtonRef = useRef(null);

  const confirmArchive = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onConfirm();
  }, [onConfirm]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    window.requestAnimationFrame(() => confirmButtonRef.current?.focus());

    const confirmOnEnter = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
        return;
      }

      confirmArchive(event);
    };

    window.addEventListener('keydown', confirmOnEnter, true);
    return () => window.removeEventListener('keydown', confirmOnEnter, true);
  }, [confirmArchive, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop nested-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
            return;
          }

          confirmArchive(event);
        }}
      >
        <p className="eyebrow">completion date</p>
        <h2>archive current checklist?</h2>
        <p className="confirm-item-text">
          The {itemCount} current checklist {itemCount === 1 ? 'item' : 'items'} will be hidden under this completion phase and cannot be used again while the phase exists. Delete the completion date later to show them normally again.
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="ghost-button"
            onClick={confirmArchive}
          >
            Create completion
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  open,
  preferences,
  onChange,
  onClose,
}) {
  if (!open) {
    return null;
  }

  const resetPreferences = () => {
    onChange(getDefaultUserPreferences());
  };

  return (
    <div className="focus-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">settings</p>
        <h2>Customize appearance</h2>
        <div className="settings-grid">
          <label className="field">
            <span>page background color</span>
            <input
              type="color"
              value={preferences.backgroundColor}
              onChange={(event) =>
                onChange({ backgroundColor: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>card color</span>
            <input
              type="color"
              value={preferences.cardColor}
              onChange={(event) => onChange({ cardColor: event.target.value })}
            />
          </label>
          <label className="field field-full">
            <span>page background image</span>
            <input
              value={preferences.backgroundImage}
              onChange={(event) =>
                onChange({ backgroundImage: event.target.value })
              }
              onFocus={selectEditableText}
              onKeyDown={(event) =>
                triggerActionOnEnter(event, () => event.currentTarget.blur())
              }
              placeholder="https://..."
            />
          </label>
          <label className="field">
            <span>text color</span>
            <input
              type="color"
              value={preferences.textColor}
              onChange={(event) => onChange({ textColor: event.target.value })}
            />
          </label>
        </div>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={resetPreferences}>
            Reset
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function UnsavedChangesModal({ open, onSave, onDiscard, onCancel }) {
  const saveButtonRef = useRef(null);

  const confirmSave = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onSave();
  }, [onSave]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    window.requestAnimationFrame(() => saveButtonRef.current?.focus());

    const confirmOnEnter = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
        return;
      }

      confirmSave(event);
    };

    window.addEventListener('keydown', confirmOnEnter, true);
    return () => window.removeEventListener('keydown', confirmOnEnter, true);
  }, [confirmSave, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop nested-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) {
            return;
          }

          confirmSave(event);
        }}
      >
        <p className="eyebrow">unsaved changes</p>
        <h2>save your changes?</h2>
        <p className="confirm-item-text">
          You have unsaved changes. Save them, discard them, or keep editing.
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onDiscard}>
            Discard Changes
          </button>
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={saveButtonRef}
            type="button"
            className="ghost-button"
            onClick={confirmSave}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginGate({
  mode,
  form,
  status,
  loading,
  onModeChange,
  onFormChange,
  onSubmit,
}) {
  return (
    <div className="login-gate">
      <form className="login-card" onSubmit={onSubmit}>
        <p className="eyebrow">sml project note</p>
        <h2>{mode === 'login' ? 'login' : 'create account'}</h2>
        <p className="login-copy">
          sign in to save the board on the server and use it from another browser.
        </p>
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => onModeChange('login')}
          >
            login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => onModeChange('register')}
          >
            register
          </button>
        </div>
        {mode === 'register' ? (
          <label className="field field-full">
            <span>name</span>
            <input
              value={form.name}
              onChange={(event) => onFormChange('name', event.target.value)}
              onFocus={selectEditableText}
              autoComplete="name"
              required
            />
          </label>
        ) : null}
        <label className="field field-full">
          <span>email</span>
          <input
            type="text"
            inputMode="email"
            value={form.email}
            onChange={(event) => onFormChange('email', event.target.value)}
            onFocus={selectEditableText}
            autoComplete="email"
            required
          />
        </label>
        <label className="field field-full">
          <span>password</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => onFormChange('password', event.target.value)}
            onFocus={selectEditableText}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
        </label>
        {mode === 'register' ? (
          <label className="field field-full">
            <span>role</span>
            <select
              value={form.role}
              onChange={(event) => onFormChange('role', event.target.value)}
            >
              <option value="manager">manager</option>
              <option value="staff">staff</option>
            </select>
          </label>
        ) : null}
        {status ? <p className="auth-status">{status}</p> : null}
        <div className="login-actions">
          <button type="submit" className="ghost-button" disabled={loading}>
            {loading ? 'working...' : mode === 'login' ? 'login' : 'create account'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChecklistItem({
  item,
  onToggleStarted,
  onToggleReviewed,
  disabled = false,
  expanded = false,
  onToggleContext,
  onDeleteCurrentContext,
  onDeleteHistoryContext,
  onEdit,
}) {
  const itemState =
    item.state || (item.checked ? CHECKLIST_STATES.COMPLETED : CHECKLIST_STATES.UNCHECKED);
  const checkedClass = itemState !== CHECKLIST_STATES.UNCHECKED && item.checkedBy
    ? `checked-${item.checkedBy}`
    : '';
  const isStarted = itemState !== CHECKLIST_STATES.UNCHECKED;
  const isReviewed = itemState === CHECKLIST_STATES.COMPLETED;
  const historyEntries = Array.isArray(item.contextHistory)
    ? [...item.contextHistory].reverse()
    : [];
  const hasContext =
    Boolean(item.context?.trim()) || historyEntries.length > 0;

  return (
    <div className={`check-entry check-state-${itemState} ${checkedClass}`}>
      <div className="check-item">
        <div className="dual-checks" aria-label="checklist progress">
          <button
            type="button"
            className="check-toggle"
            onClick={onToggleStarted}
            disabled={disabled}
            aria-label={isStarted ? 'mark item not started' : 'mark item started'}
          >
            <span className={`check-mark ${isStarted ? 'started' : ''}`} />
          </button>
          <button
            type="button"
            className="check-toggle"
            onClick={onToggleReviewed}
            disabled={disabled}
            aria-label={isReviewed ? 'remove reviewed mark' : 'mark item reviewed'}
          >
            <span className={`check-mark ${isReviewed ? 'completed' : ''}`} />
          </button>
        </div>
        {onEdit ? (
          <button
            type="button"
            className="check-label-button"
            onClick={onEdit}
          >
            <span className="check-label">
              <HighlightedText text={item.text} />
            </span>
          </button>
        ) : (
          <span className="check-label">
            <HighlightedText text={item.text} />
          </span>
        )}
        {formatChecklistTimeline(item) ? (
          <span className="check-date">{formatChecklistTimeline(item)}</span>
        ) : null}
      </div>
      {hasContext ? (
        <div className="check-context-block">
          <ContextActionButton
            open={expanded}
            hasContext
            onClick={onToggleContext}
          />
          {expanded ? (
            <div className="check-context-body">
              {item.context?.trim() ? (
                <div className="context-entry">
                  <div className="context-entry-head">
                    <ContextMeta
                      entry={{
                        createdAt: item.contextCreatedAt || item.createdAt || '',
                        completedAt:
                          item.contextCompletedAt || item.completedAt || '',
                        createdBy: item.contextCreatedBy || item.createdBy || '',
                      }}
                      fallback="latest context"
                    />
                    {onDeleteCurrentContext ? (
                      <button
                        type="button"
                        className="ghost-button muted context-delete-button"
                        onClick={onDeleteCurrentContext}
                      >
                        delete
                      </button>
                    ) : null}
                  </div>
                  <p className="context-entry-note">
                    <HighlightedText text={item.context} />
                  </p>
                </div>
              ) : null}
              {historyEntries.map((entry, index) => (
                <div className="context-entry context-entry-history" key={`${entry.createdAt}-${entry.completedAt}-${index}`}>
                  <div className="context-entry-head">
                    <ContextMeta entry={entry} fallback="saved context" />
                    {onDeleteHistoryContext ? (
                      <button
                        type="button"
                        className="ghost-button muted context-delete-button"
                        onClick={() => onDeleteHistoryContext(index)}
                      >
                        delete
                      </button>
                    ) : null}
                  </div>
                  <p className="context-entry-note">
                    <HighlightedText text={entry.note || ''} />
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CardShell({
  card,
  isOverlay = false,
  forceFull = false,
  onClick,
  onDoubleClick,
  onAddChecklistItem,
  onRequestChecklistToggle,
  onPriorityChange,
  onEditChecklistItem,
}) {
  const missingFields = getMissingFields(card);
  const visibleChecklist = getActiveChecklistItems(card.checklist);
  const cardZone = getCardZone(card);
  const isOnHold = cardZone === 'hold';
  const isCompact = !forceFull && (cardZone === 'hold' || cardZone === 'done');
  const isTopPriority = Number(card.priority) >= 5;
  const [expandedContexts, setExpandedContexts] = useState({});
  const [showAddChecklistComposer, setShowAddChecklistComposer] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistContext, setNewChecklistContext] = useState('');
  const [showChecklistContextField, setShowChecklistContextField] = useState(false);
  const [showComposerUnsavedPrompt, setShowComposerUnsavedPrompt] = useState(false);
  const inlineComposerRef = useRef(null);
  const inlineChecklistInputRef = useRef(null);
  const skipInlineComposerPromptRef = useRef(false);
  const hasInlineComposerContent = Boolean(
    newChecklistText.trim() || newChecklistContext.trim()
  );
  useUnsavedChangesWarning(hasInlineComposerContent);

  const submitChecklistItem = (event) => {
    event?.stopPropagation?.();
    const trimmedText = newChecklistText.trim();
    if (!trimmedText) {
      return;
    }

    skipInlineComposerPromptRef.current = true;
    onAddChecklistItem({
      text: trimmedText,
      context: newChecklistContext,
    });
    setNewChecklistText('');
    setNewChecklistContext('');
    setShowChecklistContextField(false);
    setShowAddChecklistComposer(false);
    setShowComposerUnsavedPrompt(false);
    window.setTimeout(() => {
      skipInlineComposerPromptRef.current = false;
    });
  };

  const discardChecklistComposer = () => {
    setShowAddChecklistComposer(false);
    setNewChecklistText('');
    setNewChecklistContext('');
    setShowChecklistContextField(false);
    setShowComposerUnsavedPrompt(false);
  };

  const cancelChecklistComposerExit = () => {
    setShowComposerUnsavedPrompt(false);
    window.requestAnimationFrame(() => inlineChecklistInputRef.current?.focus());
  };

  const requestChecklistComposerExit = () => {
    window.setTimeout(() => {
      if (
        skipInlineComposerPromptRef.current ||
        inlineComposerRef.current?.contains(document.activeElement) ||
        showComposerUnsavedPrompt
      ) {
        return;
      }

      if (hasInlineComposerContent) {
        setShowComposerUnsavedPrompt(true);
        return;
      }

      setShowAddChecklistComposer(false);
    });
  };

  const saveInlineChecklistComposerOnEnter = (event) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.defaultPrevented ||
      !newChecklistText.trim()
    ) {
      return;
    }

    event.preventDefault();
    submitChecklistItem(event);
  };

  if (isCompact) {
    return (
      <article
        className={`job-card compact-card ${isOverlay ? 'overlay' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="card-top">
          <h3 title={card.jobName || 'client - (no client name)'}>
            <HighlightedText text={card.jobName || 'client - (no client name)'} />
          </h3>
          <p
            className={isTopPriority ? 'priority-alert-job' : ''}
            title={card.taskName || 'no project assigned yet'}
          >
            <HighlightedText text={card.taskName || 'no project assigned yet'} />
          </p>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`job-card ${isOverlay ? 'overlay' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="card-top">
        <h3 title={card.jobName || 'client - (no client name)'}>
          <HighlightedText text={card.jobName || 'client - (no client name)'} />
        </h3>
        <p
          className={isTopPriority ? 'priority-alert-job' : ''}
          title={card.taskName || 'no project assigned yet'}
        >
          <HighlightedText text={card.taskName || 'no project assigned yet'} />
        </p>
      </div>

      <div className="card-meta">
        <span className="task-age">
          {formatCardAge(card.createdAt)}
        </span>
      </div>

      {missingFields.length > 0 ? (
        <div className="missing-box">
          missing: <strong>{missingFields.join(', ')}</strong>
        </div>
      ) : (
        <div className="checklist">
          {sortChecklistNewestFirst(visibleChecklist).map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              disabled={isOnHold}
              expanded={Boolean(expandedContexts[item.id])}
              onToggleContext={(event) => {
                event.stopPropagation();
                setExpandedContexts((current) => ({
                  ...current,
                  [item.id]: !current[item.id],
                }));
              }}
              onToggleStarted={(event) => {
                event.stopPropagation();
                if (!isOnHold) {
                  const itemState =
                    item.state ||
                    (item.checked
                      ? CHECKLIST_STATES.COMPLETED
                      : CHECKLIST_STATES.UNCHECKED);
                  onRequestChecklistToggle(
                    item,
                    itemState === CHECKLIST_STATES.UNCHECKED
                      ? CHECKLIST_STATES.IN_PROGRESS
                      : CHECKLIST_STATES.UNCHECKED
                  );
                }
              }}
              onToggleReviewed={(event) => {
                event.stopPropagation();
                if (!isOnHold) {
                  const itemState =
                    item.state ||
                    (item.checked
                      ? CHECKLIST_STATES.COMPLETED
                      : CHECKLIST_STATES.UNCHECKED);
                  onRequestChecklistToggle(
                    item,
                    itemState === CHECKLIST_STATES.COMPLETED
                      ? CHECKLIST_STATES.IN_PROGRESS
                      : CHECKLIST_STATES.COMPLETED
                  );
                }
              }}
              onEdit={(event) => {
                event.stopPropagation();
                onEditChecklistItem?.(item);
              }}
            />
          ))}
        </div>
      )}

      <div className="card-footer">
        <div className="card-add-area">
          {showAddChecklistComposer ? (
            <div
              ref={inlineComposerRef}
              className="inline-checklist-composer"
              onClick={(event) => event.stopPropagation()}
              onBlurCapture={requestChecklistComposerExit}
              onKeyDown={saveInlineChecklistComposerOnEnter}
            >
              <input
                ref={inlineChecklistInputRef}
                value={newChecklistText}
                onChange={(event) => setNewChecklistText(event.target.value)}
                onFocus={selectEditableText}
                onKeyDown={(event) =>
                  triggerActionOnEnter(event, () => submitChecklistItem(event))
                }
                placeholder="checklist item"
                autoFocus
              />
              <ContextActionButton
                open={showChecklistContextField}
                onClick={(event) => {
                  event.stopPropagation();
                  setShowChecklistContextField((current) => !current);
                }}
              />
              {showChecklistContextField ? (
                <textarea
                  value={newChecklistContext}
                  onChange={(event) => setNewChecklistContext(event.target.value)}
                  onFocus={selectEditableText}
                  onKeyDown={(event) =>
                    triggerActionOnEnter(event, () => submitChecklistItem(event))
                  }
                  placeholder="type a context note"
                  rows={2}
                />
              ) : null}
              <div className="inline-checklist-actions">
                <button
                  type="button"
                  className="ghost-button muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    discardChecklistComposer();
                  }}
                >CANCEL</button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={submitChecklistItem}
                >
                  add
                </button>
              </div>
              <UnsavedChangesModal
                open={showComposerUnsavedPrompt}
                onSave={submitChecklistItem}
                onDiscard={discardChecklistComposer}
                onCancel={cancelChecklistComposerExit}
              />
            </div>
          ) : (
            <button
              type="button"
              className="add-item"
              onClick={(event) => {
                event.stopPropagation();
                setShowAddChecklistComposer(true);
              }}
            >
              {isOnHold ? '+ add checklist item and move to to do' : '+ add checklist item'}
            </button>
          )}
        </div>
          <PriorityDots
          value={card.priority || 1}
          onChange={(priority) => onPriorityChange?.(priority)}
        />
      </div>
    </article>
  );
}

function ChecklistItemModal({
  open,
  item,
  onTextChange,
  contextInput,
  onContextInputChange,
  onAddContext,
  onDeleteCurrentContext,
  onDeleteHistoryContext,
  onSave,
  onDelete,
  onCancel,
}) {
  const [showContextField, setShowContextField] = useState(() =>
    Boolean(
      open &&
        (item?.context?.trim() || getChecklistContextHistory(item).length > 0)
    )
  );

  if (!open || !item) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal checklist-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
            event.preventDefault();
            onSave();
          }
        }}
      >
        <p className="eyebrow">checklist item</p>
        <h2>edit checklist item</h2>
        <label className="field field-full">
          <span>item</span>
          <input
            value={item.text}
            onChange={(event) => onTextChange(event.target.value)}
            onFocus={selectEditableText}
            autoFocus
          />
        </label>
        <ContextSummary item={item} />
        <ContextActionButton
          open={showContextField}
          hasContext={hasChecklistContext(item)}
          className="checklist-context-trigger"
          onClick={() => setShowContextField((current) => !current)}
        />
        {showContextField ? (
          <ContextThreadEditor
            item={item}
            inputValue={contextInput}
            onInputChange={onContextInputChange}
            onAddContext={onAddContext}
            onDeleteCurrentContext={onDeleteCurrentContext}
            onDeleteHistoryContext={onDeleteHistoryContext}
          />
        ) : null}
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onDelete}>
            delete
          </button>
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
          <button type="button" className="ghost-button" onClick={onSave}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

const getHoverPreviewPosition = (event) => ({
  x: Math.min(event.clientX + 18, window.innerWidth - 340),
  y: Math.min(event.clientY + 18, window.innerHeight - 360),
});

const getDragPoint = (event) => {
  const initialRect = event.active?.rect?.current?.initial;

  if (!initialRect || !event.delta) {
    return null;
  }

  return {
    x: initialRect.left + initialRect.width / 2 + event.delta.x,
    y: initialRect.top + initialRect.height / 2 + event.delta.y,
  };
};

const isIntentionalStatusDrop = (lane, point) => {
  if (!STATUS_DROP_INTENT_LANES.has(lane)) {
    return true;
  }

  if (!point || typeof document === 'undefined') {
    return false;
  }

  const target = document.querySelector(`[data-drop-lane="${lane}"]`);
  if (!target) {
    return false;
  }

  const rect = target.getBoundingClientRect();
  const insetX = Math.min(72, rect.width * 0.24);
  const insetY = Math.min(56, rect.height * 0.2);

  return (
    point.x >= rect.left + insetX &&
    point.x <= rect.right - insetX &&
    point.y >= rect.top + insetY &&
    point.y <= rect.bottom - insetY
  );
};

const isCardHeaderTarget = (target) => Boolean(target?.closest?.('.card-top'));

function DraggableCard(props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: props.card.id,
      data: {
        cardId: props.card.id,
      },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1,
    pointerEvents: isDragging ? 'none' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-card ${isDragging ? 'dragging' : ''} ${
        props.isFrontCard ? 'front-card' : 'hover-lift-card'
      }`}
      onMouseEnter={(event) => {
        if (props.isFrontCard) {
          props.onHoverPreviewEnd?.();
          return;
        }

        if (isCardHeaderTarget(event.target)) {
          props.onHoverPreview?.(props.card, event);
        }
      }}
      onMouseMove={(event) => {
        if (props.isFrontCard) {
          props.onHoverPreviewEnd?.();
          return;
        }

        if (!isCardHeaderTarget(event.target)) {
          props.onHoverPreviewEnd?.();
          return;
        }

        props.onHoverPreview?.(props.card, event);
      }}
      onMouseLeave={props.onHoverPreviewEnd}
      onPointerDown={props.onHoverPreviewEnd}
      {...listeners}
      {...attributes}
    >
      <CardShell {...props} />
    </div>
  );
}

function StaticCard(props) {
  return (
    <div
      className={`draggable-card static-card ${
        props.isFrontCard ? 'front-card' : 'hover-lift-card'
      }`}
      onMouseEnter={(event) => {
        if (props.isFrontCard) {
          props.onHoverPreviewEnd?.();
          return;
        }

        if (isCardHeaderTarget(event.target)) {
          props.onHoverPreview?.(props.card, event);
        }
      }}
      onMouseMove={(event) => {
        if (props.isFrontCard) {
          props.onHoverPreviewEnd?.();
          return;
        }

        if (!isCardHeaderTarget(event.target)) {
          props.onHoverPreviewEnd?.();
          return;
        }

        props.onHoverPreview?.(props.card, event);
      }}
      onMouseLeave={props.onHoverPreviewEnd}
      onPointerDown={props.onHoverPreviewEnd}
    >
      <CardShell {...props} />
    </div>
  );
}

function DropColumn({
  lane,
  dropId,
  count,
  children,
  className = '',
  title,
  subtitle,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId || lane,
  });
  const meta = columnMeta[lane];

  return (
    <section
      ref={setNodeRef}
      className={`board-column ${className} ${isOver ? 'is-over' : ''}`}
      data-drop-lane={lane}
      data-drop-id={dropId || lane}
    >
      <header className="column-header">
        <div>
          <h2>{title || meta.title}</h2>
          <p>{subtitle || meta.subtitle}</p>
        </div>
        <span className={`count-pill lane-${lane}`}>{count}</span>
      </header>
      {children}
    </section>
  );
}

function CardSection({
  lane,
  sectionId,
  cards,
  onCreateCard,
  onDeleteSection,
  onOpenAllCards,
  onOpenCard,
  onAddChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
  onHoverPreview,
  onHoverPreviewMove,
  onHoverPreviewEnd,
  title,
  subtitle,
  showHeader = true,
  showCreateButton = false,
  showSeeMore = true,
}) {
  const stackLimit = getStackLimit(lane);
  const visibleCards = cards.slice(-stackLimit);
  const shouldShowSeeMore =
    showSeeMore &&
    (lane === 'done' || lane === 'hold'
      ? cards.length > stackLimit
      : cards.length > 0);
  const pileHeight = getPileHeight(lane, visibleCards.length);

  return (
    <DropColumn
      lane={lane}
      dropId={sectionId}
      count={cards.length}
      className="plain-section"
      title={title}
      subtitle={subtitle}
    >
      <div className={`section-topline ${showHeader ? '' : 'is-placeholder'}`}>
        {showHeader ? (
          <>
          {showCreateButton ? (
            <button type="button" className="plus-button" onClick={onCreateCard}>
              +
            </button>
          ) : null}
          <div className="section-title-block">
            <div className="section-title-row">
              <h2>{title || columnMeta[lane].title}</h2>
              <div className="section-topline-actions">
                {shouldShowSeeMore ? (
                  <button
                    type="button"
                    className="section-see-more-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenAllCards(sectionId || lane);
                    }}
                  >
                    see more
                  </button>
                ) : null}
                {onDeleteSection ? (
                  <button
                    type="button"
                    className="section-delete-button"
                    onClick={onDeleteSection}
                    aria-label={`delete ${title || columnMeta[lane].title}`}
                    title={`delete ${title || columnMeta[lane].title}`}
                  >
                    delete
                  </button>
                ) : null}
              </div>
            </div>
            <span className="section-count">
              {cards.length > 0 ? `${cards.length} cards` : 'no cards'}
            </span>
          </div>
          </>
        ) : null}
      </div>

      <div
        className={`pile-area lane-${lane}`}
        style={{ minHeight: pileHeight }}
      >
        {visibleCards.map((card, index) => {
          const layout = getPileLayout(lane, visibleCards.length, index);

          return (
            <div
              key={card.id}
              className="pile-slot"
              style={{
                transform: `translate(${layout.x}px, ${layout.y}px) rotate(${layout.rotate || 0}deg) scale(${layout.scale})`,
              }}
            >
              {lane === 'incomplete' ? (
                <StaticCard
                  card={card}
                  isFrontCard={index === visibleCards.length - 1}
                  zIndex={10 + index}
                  onClick={() => onOpenCard(card)}
                  onDoubleClick={() => {}}
                  onAddChecklistItem={(text) => onAddChecklistItem(card.id, text)}
                  onRequestChecklistToggle={(item, nextState) =>
                    onRequestChecklistToggle(card.id, item, nextState)
                  }
                  onEditChecklistItem={(item) =>
                    onEditChecklistItem(card.id, item)
                  }
                  onPriorityChange={(priority) =>
                    useBoardStore.getState().updateCard(card.id, { priority })
                  }
                  onHoverPreview={onHoverPreview}
                  onHoverPreviewMove={onHoverPreviewMove}
                  onHoverPreviewEnd={onHoverPreviewEnd}
                />
              ) : (
                <DraggableCard
                  card={card}
                  isFrontCard={index === visibleCards.length - 1}
                  zIndex={10 + index}
                  onClick={() => onOpenCard(card)}
                  onDoubleClick={() => {}}
                  onAddChecklistItem={(text) => onAddChecklistItem(card.id, text)}
                  onRequestChecklistToggle={(item, nextState) =>
                    onRequestChecklistToggle(card.id, item, nextState)
                  }
                  onEditChecklistItem={(item) =>
                    onEditChecklistItem(card.id, item)
                  }
                  onPriorityChange={(priority) =>
                    useBoardStore.getState().updateCard(card.id, { priority })
                  }
                  onHoverPreview={onHoverPreview}
                  onHoverPreviewMove={onHoverPreviewMove}
                  onHoverPreviewEnd={onHoverPreviewEnd}
                />
              )}
            </div>
          );
        })}
      </div>

    </DropColumn>
  );
}

function CreateCardPopup({
  open,
  jobOptions,
  composerDraft,
  setComposerDraft,
  onSubmit,
  onCancel,
  onOutsideCommit,
}) {
  const submitComposerFromKeyboard = () => {
    onSubmit({ preventDefault() {} });
  };

  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onOutsideCommit}>
      <form className="composer-popup" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <div className="composer-grid">
          <label className="field">
            <span>project</span>
            <input
              value={composerDraft.taskName}
              onChange={(event) =>
                setComposerDraft((draft) => ({
                  ...draft,
                  taskName: event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, submitComposerFromKeyboard)
              }
              onFocus={selectEditableText}
              placeholder="project name"
            />
          </label>
          <label className="field">
            <span>client</span>
            <select
              value={composerDraft.jobChoice || '__new__'}
              onChange={(event) =>
                setComposerDraft((draft) => ({
                  ...draft,
                  jobChoice: event.target.value,
                  jobName:
                    event.target.value === '__new__' ? '' : event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, submitComposerFromKeyboard)
              }
            >
              {jobOptions.map((jobName) => (
                <option key={jobName} value={jobName}>
                  {jobName}
                </option>
              ))}
              <option value="__new__">add new client</option>
            </select>
          </label>
          {(!composerDraft.jobChoice || composerDraft.jobChoice === '__new__') ? (
            <label className="field field-full">
              <span>add new client</span>
              <input
                value={composerDraft.jobName}
                onChange={(event) =>
                  setComposerDraft((draft) => ({
                    ...draft,
                    jobName: event.target.value,
                  }))
                }
                onKeyDown={(event) =>
                  triggerActionOnEnter(event, submitComposerFromKeyboard)
                }
                onFocus={selectEditableText}
                placeholder="new client name"
              />
            </label>
          ) : null}
          <label className="field">
            <span>date</span>
            <input
              type="date"
              value={composerDraft.startDate}
              onChange={(event) =>
                setComposerDraft((draft) => ({
                  ...draft,
                  startDate: event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, submitComposerFromKeyboard)
              }
              onFocus={selectEditableText}
            />
          </label>
        </div>
        <div className="composer-actions">
          <button type="submit" className="ghost-button">
            create
          </button>
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
        </div>
      </form>
    </div>
  );
}

function FocusModal({ card, onClose }) {
  const cards = useBoardStore((state) => state.cards);
  const todoColumns = useBoardStore((state) => state.todoColumns);
  const currentUser = useBoardStore((state) => state.currentUser);
  const updateCard = useBoardStore((state) => state.updateCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const renameClient = useBoardStore((state) => state.renameClient);
  const jobOptions = useMemo(
    () =>
      [...new Set(cards.map((item) => item.jobName.trim()).filter(Boolean))].sort(),
    [cards]
  );
  const [draft, setDraft] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [expandedDraftContexts, setExpandedDraftContexts] = useState({});
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [pendingDeleteCard, setPendingDeleteCard] = useState(false);
  const [showAddDraftChecklistComposer, setShowAddDraftChecklistComposer] = useState(false);
  const [showCompletionMenu, setShowCompletionMenu] = useState(false);
  const [showCompletionComposer, setShowCompletionComposer] = useState(false);
  const [showCompletionArchiveWarning, setShowCompletionArchiveWarning] = useState(false);
  const [completionEndDate, setCompletionEndDate] = useState('');
  const [completionContext, setCompletionContext] = useState('');
  const [expandedCompletionIds, setExpandedCompletionIds] = useState({});
  const [newDraftChecklistText, setNewDraftChecklistText] = useState('');
  const [newDraftChecklistContext, setNewDraftChecklistContext] = useState('');
  const [showNewDraftChecklistContext, setShowNewDraftChecklistContext] = useState(false);
  const [draftContextInputs, setDraftContextInputs] = useState({});
  const [clientRenameDraft, setClientRenameDraft] = useState('');
  const [editingDraftChecklistId, setEditingDraftChecklistId] = useState(null);
  const [editingFocusField, setEditingFocusField] = useState('');
  const [showClientRename, setShowClientRename] = useState(false);
  const [showUnsavedExit, setShowUnsavedExit] = useState(false);
  const [fieldUnsavedPrompt, setFieldUnsavedPrompt] = useState(null);
  const focusFieldRefs = useRef({});
  const focusModalRef = useRef(null);
  const draftChecklistComposerRef = useRef(null);
  const draftChecklistInputRef = useRef(null);
  const skipDraftChecklistComposerPromptRef = useRef(false);
  const skipFocusBlurPromptRef = useRef(false);

  useEffect(() => {
    if (!card) {
      setDraft(null);
      setPendingToggle(null);
      setExpandedDraftContexts({});
      setPendingDeleteItem(null);
      setPendingDeleteCard(false);
      setShowAddDraftChecklistComposer(false);
      setShowCompletionMenu(false);
      setShowCompletionComposer(false);
      setShowCompletionArchiveWarning(false);
      setCompletionEndDate('');
      setCompletionContext('');
      setExpandedCompletionIds({});
      setNewDraftChecklistText('');
      setNewDraftChecklistContext('');
      setShowNewDraftChecklistContext(false);
      setDraftContextInputs({});
      setClientRenameDraft('');
      setEditingDraftChecklistId(null);
      setEditingFocusField('');
      setShowClientRename(false);
      setShowUnsavedExit(false);
      return;
    }

    setDraft(buildDraftFromCard(card));
    setPendingToggle(null);
    setExpandedDraftContexts({});
    setPendingDeleteItem(null);
    setPendingDeleteCard(false);
    setShowAddDraftChecklistComposer(false);
    setShowCompletionMenu(false);
    setShowCompletionComposer(false);
    setShowCompletionArchiveWarning(false);
    setCompletionEndDate('');
    setCompletionContext('');
    setExpandedCompletionIds({});
    setNewDraftChecklistText('');
    setNewDraftChecklistContext('');
    setShowNewDraftChecklistContext(false);
    setDraftContextInputs({});
    setClientRenameDraft(card.jobName || '');
    setEditingDraftChecklistId(null);
    setEditingFocusField('');
    setShowClientRename(false);
    setShowUnsavedExit(false);
  }, [card]);

  const cleanCardDraft = card ? buildDraftFromCard(card) : null;
  const isDirty =
    Boolean(card && draft) &&
    JSON.stringify(cleanCardDraft) !== JSON.stringify(draft);
  const hasDraftChecklistComposerContent = Boolean(
    newDraftChecklistText.trim() || newDraftChecklistContext.trim()
  );
  const hasCompletionComposerContent = Boolean(
    completionEndDate || completionContext.trim()
  );
  useUnsavedChangesWarning(
    isDirty || hasDraftChecklistComposerContent || hasCompletionComposerContent
  );

  if (!card || !draft) {
    return null;
  }

  const saveCardDraft = (nextDraft = draft) => {
    const currentActiveChecklistCount = getActiveChecklistItems(card.checklist).length;
    const nextActiveChecklistCount = getActiveChecklistItems(nextDraft.checklist).length;
    const nextLane =
      card.lane === 'hold' && nextActiveChecklistCount > currentActiveChecklistCount
        ? 'active'
        : card.lane;

    updateCard(card.id, {
      taskName: nextDraft.taskName,
      jobName: nextDraft.jobName,
      startDate: nextDraft.startDate,
      priority: nextDraft.priority,
      lane: nextLane,
      checklist: nextDraft.checklist,
    });
  };

  const saveChanges = () => {
    saveCardDraft();
  };

  const closeFocusModal = () => {
    if (isDirty) {
      setShowUnsavedExit(true);
      return;
    }

    onClose();
  };

  const saveAndCloseFocusModal = () => {
    if (isDirty) {
      saveChanges();
    }

    setShowUnsavedExit(false);
    onClose();
  };

  const saveChangesFromKeyboard = () => {
    if (isDirty) {
      saveChanges();
    }
  };

  const exitFocusModeAfterKeyboardSave = () => {
    setEditingFocusField('');
    setEditingDraftChecklistId(null);
    setFieldUnsavedPrompt(null);
    setShowUnsavedExit(false);
    blurActiveInput();
    window.setTimeout(() => {
      skipFocusBlurPromptRef.current = false;
    });
    onClose();
  };

  const refocusFocusModal = () => {
    window.requestAnimationFrame(() => focusModalRef.current?.focus());
  };

  const saveAndCloseFocusModeFromKeyboard = () => {
    skipFocusBlurPromptRef.current = true;
    saveChangesFromKeyboard();
    exitFocusModeAfterKeyboardSave();
  };

  const saveFocusModeFromKeyboard = () => {
    skipFocusBlurPromptRef.current = true;
    saveChangesFromKeyboard();
    setEditingFocusField('');
    setEditingDraftChecklistId(null);
    setFieldUnsavedPrompt(null);
    blurActiveInput();
    refocusFocusModal();
    window.setTimeout(() => {
      skipFocusBlurPromptRef.current = false;
    });
  };

  const buildDraftWithNewChecklistItem = () => {
    const trimmedText = newDraftChecklistText.trim();
    if (!trimmedText) {
      return null;
    }

    const context = newDraftChecklistContext.trim();
    const createdAt = new Date().toISOString();
    return {
      ...draft,
      checklist: [
        ...draft.checklist,
        {
          id: `draft-${Date.now()}`,
          text: trimmedText,
          state: CHECKLIST_STATES.UNCHECKED,
          checked: false,
          checkedBy: null,
          createdAt,
          completedAt: '',
          context,
          contextCreatedAt: context ? createdAt : '',
          contextCompletedAt: '',
          contextCreatedBy: context ? getContextActor(currentUser) : '',
          contextHistory: [],
          createdBy: useBoardStore.getState().currentUser.role,
        },
      ],
    };
  };

  const clearDraftChecklistComposer = () => {
    setShowAddDraftChecklistComposer(false);
    setNewDraftChecklistText('');
    setNewDraftChecklistContext('');
    setShowNewDraftChecklistContext(false);
  };

  const saveDraftChecklistComposer = () => {
    const nextDraft = buildDraftWithNewChecklistItem();
    if (!nextDraft) {
      return;
    }

    skipDraftChecklistComposerPromptRef.current = true;
    skipFocusBlurPromptRef.current = true;
    saveCardDraft(nextDraft);
    setDraft(nextDraft);
    clearDraftChecklistComposer();
    blurActiveInput();
    refocusFocusModal();
    window.setTimeout(() => {
      skipDraftChecklistComposerPromptRef.current = false;
      skipFocusBlurPromptRef.current = false;
    });
  };

  const saveDraftChecklistComposerAndClose = () => {
    const nextDraft = buildDraftWithNewChecklistItem();
    if (!nextDraft) {
      return;
    }

    skipDraftChecklistComposerPromptRef.current = true;
    skipFocusBlurPromptRef.current = true;
    saveCardDraft(nextDraft);
    clearDraftChecklistComposer();
    exitFocusModeAfterKeyboardSave();
    window.setTimeout(() => {
      skipDraftChecklistComposerPromptRef.current = false;
    });
  };

  const openCompletionComposer = () => {
    setShowCompletionMenu(false);
    setShowAddDraftChecklistComposer(false);
    setShowCompletionComposer(true);
  };

  const discardCompletionComposer = () => {
    setShowCompletionArchiveWarning(false);
    setShowCompletionComposer(false);
    setCompletionEndDate('');
    setCompletionContext('');
  };

  const buildDraftWithCompletionPhase = () => {
    if (!completionEndDate) {
      return null;
    }

    const phaseItems = getActiveChecklistItems(draft.checklist);
    if (!phaseItems.length) {
      return null;
    }

    const createdAt =
      phaseItems
        .map((item) => item.createdAt || item.completedAt || '')
        .filter(Boolean)
        .sort()[0] || new Date().toISOString();
    const phaseNumber =
      draft.checklist.filter(isCompletionChecklistItem).length + 1;
    const phaseId = `completion-${Date.now()}`;
    const phaseItemIds = phaseItems.map((item) => item.id);
    const completionItem = {
      id: phaseId,
      type: CHECKLIST_ITEM_TYPES.COMPLETION,
      text: `phase ${phaseNumber}`,
      state: CHECKLIST_STATES.COMPLETED,
      checked: false,
      checkedBy: null,
      createdAt,
      completedAt: completionEndDate,
      context: completionContext.trim(),
      contextCreatedAt: completionContext.trim() ? createdAt : '',
      contextCompletedAt: completionEndDate,
      contextCreatedBy: completionContext.trim() ? getContextActor(currentUser) : '',
      contextHistory: [],
      createdBy: useBoardStore.getState().currentUser.role,
      phaseNumber,
      phaseItemIds,
      phaseItems: phaseItems.map((item) => ({
        id: item.id,
        text: item.text,
        state: item.state,
        checked: item.checked,
        checkedBy: item.checkedBy,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
        context: item.context || '',
      })),
    };

    return {
      ...draft,
      checklist: [
        ...draft.checklist.map((item) =>
          phaseItemIds.includes(item.id)
            ? { ...item, archivedInCompletionId: phaseId }
            : item
        ),
        completionItem,
      ],
    };
  };

  const saveCompletionPhase = () => {
    const nextDraft = buildDraftWithCompletionPhase();
    if (!nextDraft) {
      return;
    }

    skipFocusBlurPromptRef.current = true;
    setShowCompletionArchiveWarning(false);
    saveCardDraft(nextDraft);
    setDraft(nextDraft);
    discardCompletionComposer();
    setExpandedCompletionIds((current) => ({
      ...current,
      [nextDraft.checklist[nextDraft.checklist.length - 1].id]: false,
    }));
    blurActiveInput();
    refocusFocusModal();
    window.setTimeout(() => {
      skipFocusBlurPromptRef.current = false;
    });
  };

  const requestSaveCompletionPhase = () => {
    if (!completionEndDate || !getActiveChecklistItems(draft.checklist).length) {
      return;
    }

    setShowCompletionArchiveWarning(true);
  };

  const buildDraftWithChecklistItem = (itemId, patch) => ({
    ...draft,
    checklist: draft.checklist.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item
    ),
  });

  const saveDraftChecklistTextEdit = (itemId) => {
    const item = draft.checklist.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    skipFocusBlurPromptRef.current = true;
    saveCardDraft(buildDraftWithChecklistItem(itemId, { text: item.text }));
    setEditingDraftChecklistId(null);
    setFieldUnsavedPrompt(null);
    blurActiveInput();
    refocusFocusModal();
    window.setTimeout(() => {
      skipFocusBlurPromptRef.current = false;
    });
  };

  const saveDraftChecklistContext = (itemId) => {
    const note = String(draftContextInputs[itemId] || '').trim();
    if (!note) {
      refocusFocusModal();
      return;
    }

    const nextDraft = {
      ...draft,
      checklist: draft.checklist.map((item) =>
        item.id === itemId
          ? addContextToChecklistItem(item, note, getContextActor(currentUser))
          : item
      ),
    };

    skipFocusBlurPromptRef.current = true;
    saveCardDraft(nextDraft);
    setDraft(nextDraft);
    setDraftContextInputs((current) => ({
      ...current,
      [itemId]: '',
    }));
    blurActiveInput();
    refocusFocusModal();
    window.setTimeout(() => {
      skipFocusBlurPromptRef.current = false;
    });
  };

  const savePendingDraftContextsAndClose = () => {
    const contextEntries = Object.entries(draftContextInputs)
      .map(([itemId, note]) => [itemId, String(note || '').trim()])
      .filter(([, note]) => note);

    if (!contextEntries.length) {
      saveAndCloseFocusModeFromKeyboard();
      return;
    }

    const contextByItemId = new Map(contextEntries);
    const nextDraft = {
      ...draft,
      checklist: draft.checklist.map((item) => {
        const note = contextByItemId.get(item.id);

        return note
          ? addContextToChecklistItem(item, note, getContextActor(currentUser))
          : item;
      }),
    };

    skipFocusBlurPromptRef.current = true;
    saveCardDraft(nextDraft);
    setDraftContextInputs((current) =>
      Object.fromEntries(
        Object.entries(current).map(([itemId, note]) => [
          itemId,
          contextByItemId.has(itemId) ? '' : note,
        ])
      )
    );
    exitFocusModeAfterKeyboardSave();
  };

  const closeFieldUnsavedPrompt = () => setFieldUnsavedPrompt(null);

  const requestUnsavedFieldExit = ({
    hasChanges,
    onSave,
    onDiscard,
    onCancel,
  }) => {
    if (fieldUnsavedPrompt) {
      return;
    }

    if (!hasChanges) {
      onDiscard();
      return;
    }

    setFieldUnsavedPrompt({
      onSave: () => {
        onSave();
        closeFieldUnsavedPrompt();
      },
      onDiscard: () => {
        onDiscard();
        closeFieldUnsavedPrompt();
      },
      onCancel: () => {
        closeFieldUnsavedPrompt();
        onCancel?.();
      },
    });
  };

  const saveFieldUnsavedPrompt = () => {
    if (!fieldUnsavedPrompt) {
      return;
    }

    fieldUnsavedPrompt.onSave();
  };

  const getSavedFocusFieldValue = (field) => cleanCardDraft[field] || '';

  const discardFocusFieldEdit = (field) => {
    setDraft((current) => ({
      ...current,
      [field]: getSavedFocusFieldValue(field),
    }));
    setEditingFocusField('');
  };

  const saveFocusFieldEdit = () => {
    saveFocusModeFromKeyboard();
  };

  const requestFocusFieldExit = (field) => {
    if (skipFocusBlurPromptRef.current) {
      return;
    }

    requestUnsavedFieldExit({
      hasChanges: hasTextValueChanged(draft[field] || '', getSavedFocusFieldValue(field)),
      onSave: saveFocusFieldEdit,
      onDiscard: () => discardFocusFieldEdit(field),
      onCancel: () =>
        window.requestAnimationFrame(() =>
          focusFieldRefs.current[field]?.focus()
        ),
    });
  };

  const getSavedDraftChecklistText = (itemId) =>
    cleanCardDraft.checklist.find((item) => item.id === itemId)?.text || '';

  const requestDraftChecklistTextExit = (itemId) => {
    if (skipFocusBlurPromptRef.current) {
      return;
    }

    const item = draft.checklist.find((entry) => entry.id === itemId);
    const savedText = getSavedDraftChecklistText(itemId);

    requestUnsavedFieldExit({
      hasChanges: hasTextValueChanged(item?.text || '', savedText),
      onSave: () => saveDraftChecklistTextEdit(itemId),
      onDiscard: () => {
        updateDraftChecklistItem(itemId, savedText);
        setEditingDraftChecklistId(null);
      },
      onCancel: () =>
        window.requestAnimationFrame(() =>
          focusFieldRefs.current[`checklist-${itemId}`]?.focus()
        ),
    });
  };

  const discardDraftChecklistComposer = () => {
    setShowAddDraftChecklistComposer(false);
    setNewDraftChecklistText('');
    setNewDraftChecklistContext('');
    setShowNewDraftChecklistContext(false);
  };

  const requestDraftChecklistComposerExit = () => {
    window.setTimeout(() => {
      if (
        skipDraftChecklistComposerPromptRef.current ||
        draftChecklistComposerRef.current?.contains(document.activeElement) ||
        fieldUnsavedPrompt
      ) {
        return;
      }

      requestUnsavedFieldExit({
        hasChanges: hasDraftChecklistComposerContent,
        onSave: saveDraftChecklistComposer,
        onDiscard: discardDraftChecklistComposer,
        onCancel: () =>
          window.requestAnimationFrame(() =>
            draftChecklistInputRef.current?.focus()
          ),
      });
    });
  };

  const saveFocusModeOnEnter = (event) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.defaultPrevented ||
      isEditableControl(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (hasDraftChecklistComposerContent) {
      saveDraftChecklistComposerAndClose();
      return;
    }

    if (Object.values(draftContextInputs).some((value) => String(value || '').trim())) {
      savePendingDraftContextsAndClose();
      return;
    }

    if (isDirty) {
      saveFocusModeFromKeyboard();
      return;
    }

    onClose();
  };

  const selectedExistingClient = jobOptions.includes(draft.jobName)
    ? draft.jobName
    : '';

  const renameSelectedClient = () => {
    const nextName = clientRenameDraft.trim();

    if (!selectedExistingClient || !nextName) {
      return;
    }

    renameClient(selectedExistingClient, nextName);
    setDraft((current) => ({
      ...current,
      jobName: nextName,
    }));
    setClientRenameDraft(nextName);
    setShowClientRename(false);
  };

  const draftCard = { ...card, ...draft };
  const canMoveToTodo = getCardZone(card) !== 'active' && getMissingFields(draftCard).length === 0;
  const canMoveToHold = getCardZone(card) !== 'hold' && getMissingFields(draftCard).length === 0;
  const canMoveToFinish =
    getCardZone(card) !== 'done' &&
    getMissingFields(draftCard).length === 0 &&
    isCardComplete(draftCard);

  const moveFocusedCard = (targetLane) => {
    updateCard(card.id, {
      taskName: draft.taskName,
      jobName: draft.jobName,
      startDate: draft.startDate,
      priority: draft.priority,
      checklist: draft.checklist,
    });
    moveCard(card.id, targetLane, todoColumns[0]?.id || '');
    onClose();
  };

  const setDraftChecklistState = (itemId, nextState) => {
    const completedAt =
      nextState === CHECKLIST_STATES.COMPLETED ? new Date().toISOString() : '';

    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === itemId
          ? {
              ...item,
              state: nextState,
              checked: nextState === CHECKLIST_STATES.COMPLETED,
              checkedBy:
                nextState === CHECKLIST_STATES.COMPLETED
                  ? useBoardStore.getState().currentUser.role
                  : null,
              completedAt,
              contextCompletedAt: completedAt,
            }
          : item
      ),
    }));
  };

  const openDraftChecklistToggle = (item, requestedState = '') => {
    if (card.lane === 'hold') {
      return;
    }

    if (requestedState) {
      setDraftChecklistState(item.id, requestedState);
      return;
    }

    const currentState =
      item.state || (item.checked ? CHECKLIST_STATES.COMPLETED : CHECKLIST_STATES.UNCHECKED);
    const nextState =
      currentState === CHECKLIST_STATES.UNCHECKED
        ? CHECKLIST_STATES.IN_PROGRESS
        : currentState === CHECKLIST_STATES.IN_PROGRESS
          ? CHECKLIST_STATES.COMPLETED
          : CHECKLIST_STATES.UNCHECKED;

    setPendingToggle({
      itemId: item.id,
      nextState,
      nextChecked: nextState === CHECKLIST_STATES.COMPLETED,
      itemText: item.text,
      context: item.context || '',
      contextCreatedAt:
        item.contextCreatedAt || item.createdAt || item.completedAt || '',
      contextCompletedAt: item.contextCompletedAt || '',
      contextCreatedBy: item.contextCreatedBy || item.createdBy || '',
      contextHistory: getChecklistContextHistory(item),
      contextInput: '',
    });
  };

  const updatePendingToggleContextInput = (value) => {
    setPendingToggle((current) =>
      current ? { ...current, contextInput: value } : current
    );
  };

  const addPendingToggleContext = () => {
    setPendingToggle((current) =>
      current
        ? {
            ...addContextToChecklistItem(
              current,
              current.contextInput,
              getContextActor(currentUser)
            ),
            contextInput: '',
          }
        : current
    );
  };

  const deletePendingToggleCurrentContext = () => {
    setPendingToggle((current) =>
      current ? deleteCurrentChecklistContext(current) : current
    );
  };

  const deletePendingToggleHistoryContext = (index) => {
    setPendingToggle((current) =>
      current ? deleteChecklistHistoryContext(current, index) : current
    );
  };

  const confirmDraftChecklistToggle = () => {
    if (!pendingToggle) {
      return;
    }

    const currentUserRole = useBoardStore.getState().currentUser.role;
    const currentUserName = getContextActor(useBoardStore.getState().currentUser);

    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === pendingToggle.itemId
          ? (() => {
              const previousNote = item.context.trim();
              const nextNote = pendingToggle.context.trim();
              const shouldArchivePrevious =
                previousNote &&
                previousNote !== nextNote &&
                pendingToggle.contextHistory === item.contextHistory;
              const nextState = pendingToggle.nextState ||
                (pendingToggle.nextChecked
                  ? CHECKLIST_STATES.COMPLETED
                  : CHECKLIST_STATES.UNCHECKED);
              const completedAt = nextState === CHECKLIST_STATES.COMPLETED
                ? new Date().toISOString()
                : '';

              return {
                ...item,
                state: nextState,
                checked: nextState === CHECKLIST_STATES.COMPLETED,
                checkedBy:
                  nextState === CHECKLIST_STATES.COMPLETED
                    ? currentUserRole
                    : null,
                createdAt:
                  item.createdAt || item.completedAt || new Date().toISOString(),
                completedAt,
                context: nextNote,
                contextCreatedAt: nextNote
                  ? pendingToggle.contextCreatedAt ||
                    (shouldArchivePrevious
                      ? new Date().toISOString()
                      : item.contextCreatedAt || new Date().toISOString())
                  : '',
                contextCompletedAt: completedAt,
                contextHistory: shouldArchivePrevious
                  ? [
                      ...(item.contextHistory || []),
                      {
                        note: item.context,
                        createdAt:
                          item.contextCreatedAt || item.createdAt || '',
                        completedAt:
                          item.contextCompletedAt || item.completedAt || '',
                        createdBy:
                          item.contextCreatedBy || item.createdBy || '',
                      },
                    ]
                  : getChecklistContextHistory(pendingToggle),
                contextCreatedBy: nextNote
                  ? pendingToggle.contextCreatedBy ||
                    (shouldArchivePrevious
                      ? currentUserName
                      : item.contextCreatedBy || currentUserName)
                  : '',
              };
            })()
          : item
      ),
    }));
    setPendingToggle(null);
  };

  const updateDraftChecklistItem = (itemId, text) => {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === itemId ? { ...item, text } : item
      ),
    }));
  };

  const updateDraftContextInput = (itemId, context) => {
    setDraftContextInputs((current) => ({
      ...current,
      [itemId]: context,
    }));
  };

  const deleteDraftCurrentContext = (itemId) => {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === itemId
          ? deleteCurrentChecklistContext(item)
          : item
      ),
    }));
  };

  const deleteDraftHistoryContext = (itemId, historyIndexFromNewest) => {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        return deleteChecklistHistoryContext(item, historyIndexFromNewest);
      }),
    }));
  };

  const confirmDeleteDraftChecklistItem = () => {
    if (!pendingDeleteItem) {
      return;
    }

    const isDeletingCompletion = isCompletionChecklistItem(
      draft.checklist.find((item) => item.id === pendingDeleteItem.id)
    );
    const nextDraft = {
      ...draft,
      checklist: draft.checklist
        .filter((item) => item.id !== pendingDeleteItem.id)
        .map((item) =>
          isDeletingCompletion && item.archivedInCompletionId === pendingDeleteItem.id
            ? { ...item, archivedInCompletionId: '' }
            : item
        ),
    };

    skipFocusBlurPromptRef.current = true;
    saveCardDraft(nextDraft);
    setPendingDeleteItem(null);
    exitFocusModeAfterKeyboardSave();
  };

  const confirmDeleteCard = () => {
    deleteCard(card.id);
    setPendingDeleteCard(false);
    onClose();
  };

  const displayStartDate = draft.startDate
    ? formatCardDisplayDate(draft.startDate)
    : 'no date';
  const visibleFocusChecklist = sortChecklistNewestFirst(
    draft.checklist.filter(
      (item) => isCompletionChecklistItem(item) || isActiveChecklistItem(item)
    )
  );
  const hasActiveChecklistItems = getActiveChecklistItems(draft.checklist).length > 0;

  return (
    <div className="focus-backdrop" onClick={closeFocusModal}>
      <div
        ref={focusModalRef}
        className="focus-modal"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={saveFocusModeOnEnter}
      >
        <div className="focus-header">
          <div className="focus-title-line">
            <span>focus mode</span>
          </div>
          <button type="button" className="close-button" onClick={closeFocusModal}>CLOSE</button>
        </div>

        <div className="focus-grid">
          <section className="focus-project-info" aria-label="project info">
            {selectedExistingClient ? (
              <button
                type="button"
                className="focus-rename-trigger"
                onClick={() => setShowClientRename((current) => !current)}
                title="Rename client"
              >
                ...
              </button>
            ) : null}
            <div className="focus-info-grid">
              <div className="focus-info-field">
                <span>project name</span>
                {editingFocusField === 'taskName' ? (
                  <input
                    ref={(node) => {
                      focusFieldRefs.current.taskName = node;
                    }}
                    value={draft.taskName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        taskName: event.target.value,
                      }))
                    }
                    onFocus={selectEditableText}
                    onBlur={() => requestFocusFieldExit('taskName')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        triggerActionOnEnter(event, saveFocusFieldEdit);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <button type="button" onClick={() => setEditingFocusField('taskName')}>
                    <HighlightedText text={draft.taskName || 'untitled project'} />
                  </button>
                )}
              </div>
              <div className="focus-info-field">
                <span>client</span>
                {editingFocusField === 'jobName' ? (
                  <>
                    <select
                      value={jobOptions.includes(draft.jobName) ? draft.jobName : '__custom__'}
                      onChange={(event) => {
                        const nextJobName =
                          event.target.value === '__custom__' ? '' : event.target.value;
                        setDraft((current) => ({
                          ...current,
                          jobName: nextJobName,
                        }));
                        setClientRenameDraft(nextJobName);
                      }}
                      onKeyDown={(event) =>
                        triggerActionOnEnter(event, saveFocusFieldEdit)
                      }
                      autoFocus
                    >
                      <option value="">select existing client</option>
                      {jobOptions.map((jobName) => (
                        <option key={jobName} value={jobName}>
                          {jobName}
                        </option>
                      ))}
                      <option value="__custom__">add new client</option>
                    </select>
                    {!jobOptions.includes(draft.jobName) || draft.jobName === '' ? (
                      <input
                        ref={(node) => {
                          focusFieldRefs.current.jobName = node;
                        }}
                        value={draft.jobName}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            jobName: event.target.value,
                          }))
                        }
                        onFocus={selectEditableText}
                        onBlur={() => requestFocusFieldExit('jobName')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            triggerActionOnEnter(event, saveFocusFieldEdit);
                          }
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <button type="button" onClick={() => setEditingFocusField('jobName')}>
                    <HighlightedText text={draft.jobName || 'no client'} />
                  </button>
                )}
              </div>
              <div className="focus-info-field">
                <span>start date</span>
                {editingFocusField === 'startDate' ? (
                  <input
                    ref={(node) => {
                      focusFieldRefs.current.startDate = node;
                    }}
                    type="date"
                    value={draft.startDate}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                    onFocus={selectEditableText}
                    onBlur={() => requestFocusFieldExit('startDate')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        triggerActionOnEnter(event, saveFocusFieldEdit);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <button type="button" onClick={() => setEditingFocusField('startDate')}>
                    {displayStartDate}
                  </button>
                )}
              </div>
              <div className="focus-info-field focus-info-priority">
                <span>priority</span>
                <PriorityDots
                  value={draft.priority || 1}
                  onChange={(priority) =>
                    setDraft((current) => ({ ...current, priority }))
                  }
                />
              </div>
            </div>
            {showClientRename && selectedExistingClient ? (
              <div className="client-rename-row">
                <input
                  ref={(node) => {
                    focusFieldRefs.current.clientRename = node;
                  }}
                  value={clientRenameDraft}
                  onChange={(event) => setClientRenameDraft(event.target.value)}
                  onFocus={selectEditableText}
                  onBlur={() => {
                    requestUnsavedFieldExit({
                      hasChanges: hasTextValueChanged(
                        clientRenameDraft,
                        selectedExistingClient
                      ),
                      onSave: () => {
                        renameSelectedClient();
                        setShowClientRename(false);
                        blurActiveInput();
                      },
                      onDiscard: () => {
                        setClientRenameDraft(selectedExistingClient);
                        setShowClientRename(false);
                      },
                      onCancel: () =>
                        window.requestAnimationFrame(() =>
                          focusFieldRefs.current.clientRename?.focus()
                        ),
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      triggerActionOnEnter(event, () => {
                        renameSelectedClient();
                        setShowClientRename(false);
                        blurActiveInput();
                      });
                    }
                  }}
                />
                <button
                  type="button"
                  className="ghost-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    renameSelectedClient();
                    setShowClientRename(false);
                    blurActiveInput();
                  }}
                  disabled={!clientRenameDraft.trim()}
                >
                  rename
                </button>
              </div>
            ) : null}
          </section>

          <section className="modal-checklist focus-checklist">
            <div className="modal-section-header">
              <h3>checklist</h3>
              <div className="checklist-add-controls">
                <button
                  type="button"
                  onClick={() => {
                    setShowCompletionMenu(false);
                    setShowCompletionComposer(false);
                    setShowAddDraftChecklistComposer((current) => !current);
                  }}
                >
                  + add item
                </button>
                <div className="completion-menu-wrap">
                  <button
                    type="button"
                    className="completion-menu-trigger"
                    aria-label="completion options"
                    aria-haspopup="menu"
                    aria-expanded={showCompletionMenu}
                    onClick={() => setShowCompletionMenu((current) => !current)}
                  >
                    <span aria-hidden="true">...</span>
                  </button>
                  {showCompletionMenu ? (
                    <div className="completion-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={openCompletionComposer}
                        disabled={!hasActiveChecklistItems}
                      >
                        add completion date
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {showAddDraftChecklistComposer ? (
              <div
                ref={draftChecklistComposerRef}
                className="modal-check-composer"
                onBlurCapture={requestDraftChecklistComposerExit}
              >
                <div className="modal-check-composer-row">
                  <input
                    ref={draftChecklistInputRef}
                    value={newDraftChecklistText}
                    onChange={(event) => setNewDraftChecklistText(event.target.value)}
                    onFocus={selectEditableText}
                    onKeyDown={(event) =>
                      triggerActionOnEnter(event, saveDraftChecklistComposer)
                    }
                    placeholder="checklist item"
                    autoFocus
                  />
                  <ContextActionButton
                    open={showNewDraftChecklistContext}
                    onClick={() =>
                      setShowNewDraftChecklistContext((current) => !current)
                    }
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={saveDraftChecklistComposerAndClose}
                  >
                    add
                  </button>
                  <button
                    type="button"
                    className="ghost-button muted"
                    onClick={discardDraftChecklistComposer}
                  >CANCEL</button>
                </div>
                {showNewDraftChecklistContext ? (
                  <textarea
                    value={newDraftChecklistContext}
                    onChange={(event) =>
                      setNewDraftChecklistContext(event.target.value)
                    }
                    onFocus={selectEditableText}
                    onKeyDown={(event) =>
                      triggerActionOnEnter(event, saveDraftChecklistComposer)
                    }
                    placeholder="type a context note"
                    rows={2}
                  />
                ) : null}
              </div>
            ) : null}
            {showCompletionComposer ? (
              <div className="modal-check-composer completion-composer">
                <label className="field">
                  <span>completion date</span>
                  <input
                    type="date"
                    value={completionEndDate}
                    onChange={(event) => setCompletionEndDate(event.target.value)}
                    autoFocus
                  />
                </label>
                <label className="field field-full">
                  <span>context</span>
                  <textarea
                    value={completionContext}
                    onChange={(event) => setCompletionContext(event.target.value)}
                    onFocus={selectEditableText}
                    placeholder="type phase context"
                    rows={2}
                  />
                </label>
                <div className="modal-check-composer-actions">
                  <button
                    type="button"
                    className="ghost-button muted"
                    onClick={discardCompletionComposer}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={requestSaveCompletionPhase}
                    disabled={!completionEndDate || !hasActiveChecklistItems}
                  >
                    save completion
                  </button>
                </div>
              </div>
            ) : null}
            {visibleFocusChecklist.map((item) => {
              if (isCompletionChecklistItem(item)) {
                const isExpanded = Boolean(expandedCompletionIds[item.id]);

                return (
                  <div
                    className="modal-check-editor completion-phase"
                    key={item.id}
                  >
                    <div className="completion-phase-main">
                      <button
                        type="button"
                        className="completion-phase-toggle"
                        onClick={() =>
                          setExpandedCompletionIds((current) => ({
                            ...current,
                            [item.id]: !current[item.id],
                          }))
                        }
                        aria-expanded={isExpanded}
                      >
                        <strong>{formatCompletionPhaseLabel(item)}</strong>
                      </button>
                      <div className="modal-check-actions">
                        <button
                          type="button"
                          className="ghost-button muted"
                          onClick={() =>
                            setPendingDeleteItem({ id: item.id, text: item.text })
                          }
                        >
                          delete
                        </button>
                      </div>
                    </div>
                    {item.context?.trim() ? (
                      <p className="focus-context-inline completion-context">
                        <HighlightedText text={item.context} />
                      </p>
                    ) : null}
                    {isExpanded ? (
                      <div className="completion-phase-items">
                        {(item.phaseItems || []).map((phaseItem) => (
                          <div className="completion-phase-item" key={phaseItem.id}>
                            <span>
                              <HighlightedText text={phaseItem.text} />
                            </span>
                            {formatChecklistTimeline(phaseItem) ? (
                              <small>{formatChecklistTimeline(phaseItem)}</small>
                            ) : null}
                            {phaseItem.context?.trim() ? (
                              <p>
                                <HighlightedText text={phaseItem.context} />
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }

              const itemState =
                item.state ||
                (item.checked
                  ? CHECKLIST_STATES.COMPLETED
                  : CHECKLIST_STATES.UNCHECKED);

              return (
                <div
                  className={`modal-check-editor check-state-${itemState}`}
                  key={item.id}
                >
                  <div className="modal-check-main">
                    <div className="dual-checks" aria-label="checklist progress">
                      <button
                        type="button"
                        className="check-toggle"
                        onClick={() => {
                          openDraftChecklistToggle(
                            item,
                            itemState === CHECKLIST_STATES.UNCHECKED
                              ? CHECKLIST_STATES.IN_PROGRESS
                              : CHECKLIST_STATES.UNCHECKED
                          );
                        }}
                        disabled={card.lane === 'hold'}
                        aria-label="toggle started"
                      >
                        <span
                          className={`check-mark ${
                            itemState !== CHECKLIST_STATES.UNCHECKED
                              ? 'started'
                              : ''
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        className="check-toggle"
                        onClick={() => {
                          openDraftChecklistToggle(
                            item,
                            itemState === CHECKLIST_STATES.COMPLETED
                              ? CHECKLIST_STATES.IN_PROGRESS
                              : CHECKLIST_STATES.COMPLETED
                          );
                        }}
                        disabled={card.lane === 'hold'}
                        aria-label="toggle reviewed"
                      >
                        <span
                          className={`check-mark ${
                            itemState === CHECKLIST_STATES.COMPLETED
                              ? 'completed'
                              : ''
                          }`}
                        />
                      </button>
                    </div>
                    <div className="modal-check-copy">
                      {editingDraftChecklistId === item.id ? (
                        <input
                          ref={(node) => {
                            focusFieldRefs.current[`checklist-${item.id}`] = node;
                          }}
                          value={item.text}
                          onChange={(event) =>
                            updateDraftChecklistItem(item.id, event.target.value)
                          }
                          onFocus={selectEditableText}
                          onBlur={() => requestDraftChecklistTextExit(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              saveDraftChecklistTextEdit(item.id);
                            }
                          }}
                          className="modal-check-input"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="modal-check-label-button"
                          onClick={() => setEditingDraftChecklistId(item.id)}
                        >
                          <HighlightedText text={item.text} />
                        </button>
                      )}
                      {getChecklistContextPreview(item) ? (
                        <p className="focus-context-inline">
                          <HighlightedText text={getChecklistContextPreview(item)} />
                        </p>
                      ) : null}
                    </div>
                    <div className="modal-check-actions">
                      <ContextActionButton
                        open={Boolean(expandedDraftContexts[item.id])}
                        hasContext={hasChecklistContext(item)}
                        onClick={() =>
                          setExpandedDraftContexts((current) => ({
                            ...current,
                            [item.id]: !current[item.id],
                          }))
                        }
                      />
                      {editingDraftChecklistId !== item.id ? (
                        <button
                          type="button"
                          className="ghost-button muted"
                          onClick={() => setEditingDraftChecklistId(item.id)}
                        >
                          edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button muted"
                        onClick={() =>
                          setPendingDeleteItem({ id: item.id, text: item.text })
                        }
                      >
                        delete
                      </button>
                    </div>
                  </div>
                  {expandedDraftContexts[item.id] ? (
                    <ContextThreadEditor
                      item={item}
                      inputValue={draftContextInputs[item.id] || ''}
                      onInputChange={(context) =>
                        updateDraftContextInput(item.id, context)
                      }
                      onAddContext={() => saveDraftChecklistContext(item.id)}
                      onDeleteCurrentContext={() =>
                        deleteDraftCurrentContext(item.id)
                      }
                      onDeleteHistoryContext={(index) =>
                        deleteDraftHistoryContext(item.id, index)
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </section>
          <div className="focus-command-row">
            {canMoveToTodo || canMoveToHold || canMoveToFinish ? (
              <div className="focus-move-actions">
              {canMoveToTodo ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => moveFocusedCard('active')}
                >
                  move to to do
                </button>
              ) : null}
              {canMoveToHold ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => moveFocusedCard('hold')}
                >
                  move to on hold
                </button>
              ) : null}
              {canMoveToFinish ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => moveFocusedCard('done')}
                >
                  move to finish
                </button>
              ) : null}
              </div>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="ghost-button muted"
              onClick={() => setPendingDeleteCard(true)}
            >
              delete card
            </button>
          </div>
          {isDirty ? (
            <div className="focus-actions">
              <button
                type="button"
                className="ghost-button muted"
                onClick={() => {
                  setDraft(buildDraftFromCard(card));
                  onClose();
                }}
              >CANCEL</button>
              <button
                type="button"
                className="ghost-button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={saveFocusModeFromKeyboard}
              >
                SAVE
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <UnsavedChangesModal
        open={Boolean(fieldUnsavedPrompt)}
        onSave={saveFieldUnsavedPrompt}
        onDiscard={() => fieldUnsavedPrompt?.onDiscard()}
        onCancel={() => fieldUnsavedPrompt?.onCancel()}
      />
      <ChecklistConfirmModal
        key={
          pendingToggle
            ? `focus-toggle-${pendingToggle.itemId}-${pendingToggle.nextChecked ? 'check' : 'uncheck'}`
            : 'focus-toggle-closed'
        }
        open={Boolean(pendingToggle)}
        nextChecked={pendingToggle?.nextChecked}
        nextState={pendingToggle?.nextState}
        itemText={pendingToggle?.itemText}
        contextItem={pendingToggle}
        contextInput={pendingToggle?.contextInput || ''}
        onContextInputChange={updatePendingToggleContextInput}
        onAddContext={addPendingToggleContext}
        onDeleteCurrentContext={deletePendingToggleCurrentContext}
        onDeleteHistoryContext={deletePendingToggleHistoryContext}
        onConfirm={confirmDraftChecklistToggle}
        onCancel={() => setPendingToggle(null)}
      />
      <DeleteChecklistModal
        open={Boolean(pendingDeleteItem)}
        itemText={pendingDeleteItem?.text}
        onConfirm={confirmDeleteDraftChecklistItem}
        onCancel={() => setPendingDeleteItem(null)}
      />
      <DeleteCardModal
        open={pendingDeleteCard}
        cardTitle={draft.jobName || draft.taskName || 'untitled card'}
        onConfirm={confirmDeleteCard}
        onCancel={() => setPendingDeleteCard(false)}
      />
      <CompletionArchiveWarningModal
        open={showCompletionArchiveWarning}
        itemCount={getActiveChecklistItems(draft.checklist).length}
        onConfirm={saveCompletionPhase}
        onCancel={() => setShowCompletionArchiveWarning(false)}
      />
      <UnsavedChangesModal
        open={showUnsavedExit}
        onSave={saveAndCloseFocusModal}
        onDiscard={() => {
          setShowUnsavedExit(false);
          onClose();
        }}
        onCancel={() => setShowUnsavedExit(false)}
      />
    </div>
  );
}

function WorkspaceTabs({
  workspaces,
  activeWorkspaceId,
  onSwitch,
  onCreate,
  onRename,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [showRenameUnsavedPrompt, setShowRenameUnsavedPrompt] = useState(false);
  const renameInputRef = useRef(null);
  const editingWorkspace = workspaces.find((workspace) => workspace.id === editingId);
  const savedWorkspaceName = editingWorkspace?.name || '';
  const hasRenameChanges =
    editingId && hasTextValueChanged(draftName, savedWorkspaceName);
  useUnsavedChangesWarning(Boolean(hasRenameChanges));

  const startRename = (workspace) => {
    setEditingId(workspace.id);
    setDraftName(workspace.name || '');
  };

  const commitRename = () => {
    if (editingId && draftName.trim()) {
      onRename(editingId, draftName);
    }
    setEditingId(null);
    setDraftName('');
    setShowRenameUnsavedPrompt(false);
    blurActiveInput();
  };

  const discardRename = () => {
    setEditingId(null);
    setDraftName('');
    setShowRenameUnsavedPrompt(false);
  };

  const cancelRenameExit = () => {
    setShowRenameUnsavedPrompt(false);
    window.requestAnimationFrame(() => renameInputRef.current?.focus());
  };

  const requestRenameExit = () => {
    if (hasRenameChanges) {
      setShowRenameUnsavedPrompt(true);
      return;
    }

    discardRename();
  };

  return (
    <nav className="workspace-tabs" aria-label="client workspaces">
      <div className="workspace-tab-list">
        {workspaces.map((workspace) => (
          <button
            type="button"
            className={`workspace-tab ${workspace.id === activeWorkspaceId ? 'active' : ''}`}
            key={workspace.id}
            onClick={() => onSwitch(workspace.id)}
            onDoubleClick={() => startRename(workspace)}
            title="Double click to rename"
          >
            {editingId === workspace.id ? (
              <input
                ref={renameInputRef}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onFocus={selectEditableText}
                onBlur={requestRenameExit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    commitRename();
                  }
                  if (event.key === 'Escape') {
                    setEditingId(null);
                    setDraftName('');
                  }
                }}
                autoFocus
              />
            ) : (
              <span className="workspace-tab-name">
                {workspace.name || 'Workspace'}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="workspace-add"
          onClick={onCreate}
          aria-label="add client tab"
          title="Add client tab"
        >
          +
        </button>
      </div>
      <UnsavedChangesModal
        open={showRenameUnsavedPrompt}
        onSave={commitRename}
        onDiscard={discardRename}
        onCancel={cancelRenameExit}
      />
    </nav>
  );
}

function App() {
  const cards = useBoardStore((state) => state.cards);
  const todoColumns = useBoardStore((state) => state.todoColumns);
  const workspaces = useBoardStore((state) => state.workspaces || []);
  const activeWorkspaceId = useBoardStore((state) => state.activeWorkspaceId);
  const currentUser = useBoardStore((state) => state.currentUser);
  const userPreferences = useBoardStore((state) => state.userPreferences || {});
  const createCard = useBoardStore((state) => state.createCard);
  const createWorkspace = useBoardStore((state) => state.createWorkspace);
  const renameWorkspace = useBoardStore((state) => state.renameWorkspace);
  const switchWorkspace = useBoardStore((state) => state.switchWorkspace);
  const importCards = useBoardStore((state) => state.importCards);
  const updateCard = useBoardStore((state) => state.updateCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const bringToFront = useBoardStore((state) => state.bringToFront);
  const addChecklistItem = useBoardStore((state) => state.addChecklistItem);
  const toggleChecklistItem = useBoardStore((state) => state.toggleChecklistItem);
  const hydrateBoard = useBoardStore((state) => state.hydrateBoard);
  const logoutUser = useBoardStore((state) => state.logoutUser);
  const updateUserPreferences = useBoardStore((state) => state.updateUserPreferences);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState('');
  const [frontCardId, setFrontCardId] = useState('');
  const [activeCardId, setActiveCardId] = useState(null);
  const [focusCardId, setFocusCardId] = useState(null);
  const [viewMode, setViewMode] = useState('board');
  const [expandedSection, setExpandedSection] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [showExportConfig, setShowExportConfig] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [pendingReopenCardId, setPendingReopenCardId] = useState(null);
  const [pendingHoldMove, setPendingHoldMove] = useState(null);
  const [editingChecklistTarget, setEditingChecklistTarget] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [authToken, setAuthToken] = useState(readStoredAuthToken);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [, setSyncStatus] = useState('');
  const [footerNow, setFooterNow] = useState(() => new Date());
  const [boardHydrated, setBoardHydrated] = useState(false);
  const [serverBoardUpdatedAt, setServerBoardUpdatedAt] = useState('');
  const [, setServerMeta] = useState(createEmptyServerMeta);
  const [showComposerUnsavedPrompt, setShowComposerUnsavedPrompt] = useState(false);
  const [showChecklistUnsavedPrompt, setShowChecklistUnsavedPrompt] = useState(false);
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'manager',
  });
  const [exportColumns, setExportColumns] = useState(() =>
    EXPORT_FIELDS.map((field) => ({ ...field, enabled: true }))
  );
  const [composerDraft, setComposerDraft] = useState({
    taskName: '',
    jobName: '',
    jobChoice: '',
    startDate: '',
    todoColumnId: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  useEffect(() => {
    setSearchTerm('');
    setFocusCardId(null);
    setExpandedSection(null);
    setViewMode('board');
    setPendingToggle(null);
    setPendingHoldMove(null);
    setEditingChecklistTarget(null);
    setHoverPreview(null);
    setFrontCardId('');
  }, [activeWorkspaceId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFooterNow(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!authToken) {
      setBoardHydrated(false);
      setServerBoardUpdatedAt('');
      setServerMeta(createEmptyServerMeta());
      setAuthReady(true);
      return () => {
        cancelled = true;
      };
    }

    setAuthReady(false);
    fetchSession(authToken)
      .then((session) => {
        if (cancelled) {
          return;
        }

        hydrateBoard(session.board, session.user);
        setServerBoardUpdatedAt(session.board?.updatedAt || '');
        setServerMeta({
          ...createEmptyServerMeta(),
          ...(session.meta || {}),
        });
        setBoardHydrated(true);
        setAuthReady(true);
        setAuthStatus('');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        logoutUser();
        setAuthToken('');
        setBoardHydrated(false);
        setServerBoardUpdatedAt('');
        setServerMeta(createEmptyServerMeta());
        setAuthReady(true);
        setAuthStatus(error.message || 'session expired. please login again.');
      });

    return () => {
      cancelled = true;
    };
  }, [authToken, hydrateBoard, logoutUser]);

  useEffect(() => {
    if (!authToken || !authReady || !boardHydrated) {
      return undefined;
    }

    const syncTimer = window.setTimeout(() => {
      setSyncStatus('saving...');
      saveBoardRequest(
        authToken,
        { cards, todoColumns, workspaces, activeWorkspaceId },
        serverBoardUpdatedAt
      )
        .then((payload) => {
          const savedBoard = payload.board || payload;
          setServerBoardUpdatedAt(savedBoard.updatedAt || '');
          setServerMeta((current) => ({
            ...current,
            ...(payload.meta || {}),
          }));
          setSyncStatus('saved');
        })
        .catch((error) => {
          setSyncStatus(
            error.message?.includes('server')
              ? 'server changed, refresh'
              : 'save failed'
          );
        });
    }, 700);

    return () => window.clearTimeout(syncTimer);
  }, [
    authToken,
    authReady,
    boardHydrated,
    cards,
    todoColumns,
    workspaces,
    activeWorkspaceId,
    serverBoardUpdatedAt,
    hydrateBoard,
  ]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthStatus('');

    try {
      const request =
        authMode === 'login'
          ? loginRequest({
              email: authForm.email,
              password: authForm.password,
            })
          : registerRequest(authForm);
      const session = await request;

      window.localStorage.setItem(AUTH_TOKEN_KEY, session.token);
      hydrateBoard(session.board, session.user);
      setServerBoardUpdatedAt(session.board?.updatedAt || '');
      setServerMeta({
        ...createEmptyServerMeta(),
        ...(session.meta || {}),
      });
      setBoardHydrated(true);
      setAuthToken(session.token);
      setAuthReady(true);
      setAuthForm((current) => ({
        ...current,
        password: '',
      }));
    } catch (error) {
      setAuthStatus(error.message || 'could not login.');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    logoutUser();
    setAuthToken('');
    setBoardHydrated(false);
    setServerBoardUpdatedAt('');
    setServerMeta(createEmptyServerMeta());
    setAuthReady(true);
    setSyncStatus('');
  };

  const createClientWorkspace = () => {
    const name = window.prompt('Client or workspace name');
    if (name?.trim()) {
      createWorkspace(name);
    }
  };

  const filteredCards = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return cards;
    }

    return cards.filter((card) =>
      [card.taskName, card.jobName]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [cards, searchTerm]);

  const lanes = useMemo(() => {
    const grouped = {
      activeByColumn: Object.fromEntries(
        todoColumns.map((column) => [column.id, []])
      ),
      done: [],
      hold: [],
      incomplete: [],
    };
    const fallbackTodoColumnId = todoColumns[0]?.id || '';

    [...filteredCards]
      .sort((a, b) => a.order - b.order)
      .forEach((card) => {
        const zone = getCardZone(card);

        if (zone === 'active') {
          const todoColumnId = getVisibleTodoColumnId(
            todoColumns,
            card.todoColumnId || fallbackTodoColumnId
          );

          if (!grouped.activeByColumn[todoColumnId]) {
            grouped.activeByColumn[todoColumnId] = [];
          }

          grouped.activeByColumn[todoColumnId].push(card);
          return;
        }

        grouped[zone].push(card);
      });

    return sortMode ? sortGroupedLanes(grouped, sortMode, frontCardId) : grouped;
  }, [filteredCards, todoColumns, sortMode, frontCardId]);

  const focusCard = cards.find((card) => card.id === focusCardId) || null;
  const activeDragCard = cards.find((card) => card.id === activeCardId) || null;
  const pendingReopenCard =
    cards.find((card) => card.id === pendingReopenCardId) || null;
  const jobOptions = useMemo(
    () => [...new Set(cards.map((card) => card.jobName.trim()).filter(Boolean))].sort(),
    [cards]
  );
  const showHoverPreview = (card, event) => {
    if (activeCardId) {
      return;
    }

    setHoverPreview({
      cardId: card.id,
      ...getHoverPreviewPosition(event),
    });
  };
  const moveHoverPreview = (event) => {
    setHoverPreview((current) =>
      current
        ? {
            ...current,
            ...getHoverPreviewPosition(event),
          }
        : current
    );
  };
  const hideHoverPreview = () => setHoverPreview(null);
  const hoverPreviewCard = hoverPreview
    ? cards.find((card) => card.id === hoverPreview.cardId)
    : null;
  const preferenceKey = useMemo(
    () => getCurrentUserPreferenceKey(currentUser),
    [currentUser]
  );
  const appearancePreferences = useMemo(
    () => normalizePreferences(userPreferences[preferenceKey]),
    [preferenceKey, userPreferences]
  );
  const appAppearanceStyle = {
    '--bg': appearancePreferences.backgroundColor,
    '--surface': appearancePreferences.cardColor,
    '--text': appearancePreferences.textColor,
    '--muted': appearancePreferences.textColor,
    backgroundColor: appearancePreferences.backgroundColor,
    backgroundImage: appearancePreferences.backgroundImage.trim()
      ? `linear-gradient(color-mix(in srgb, ${appearancePreferences.backgroundColor} 78%, transparent), color-mix(in srgb, ${appearancePreferences.backgroundColor} 78%, transparent)), url("${appearancePreferences.backgroundImage.trim()}")`
      : 'none',
    backgroundSize: appearancePreferences.backgroundImage.trim() ? 'cover' : undefined,
    backgroundPosition: appearancePreferences.backgroundImage.trim() ? 'center' : undefined,
    backgroundAttachment: appearancePreferences.backgroundImage.trim() ? 'fixed' : undefined,
  };

  const submitComposer = (event) => {
    event.preventDefault();
    createCard({
      taskName: composerDraft.taskName,
      jobName: composerDraft.jobName,
      startDate: composerDraft.startDate,
      lane: 'active',
      todoColumnId: composerDraft.todoColumnId || todoColumns[0]?.id || '',
    });
    setComposerDraft({
      taskName: '',
      jobName: '',
      jobChoice: '',
      startDate: '',
      todoColumnId: '',
    });
    setShowComposer(false);
    setShowComposerUnsavedPrompt(false);
  };

  const resetComposerDraft = () => {
    setComposerDraft({
      taskName: '',
      jobName: '',
      jobChoice: '',
      startDate: '',
      todoColumnId: '',
    });
  };

  const hasComposerDraftContent = () =>
    Boolean(
      composerDraft.taskName.trim() ||
        composerDraft.jobName.trim() ||
        composerDraft.startDate
    );
  useUnsavedChangesWarning(showComposer && hasComposerDraftContent());

  const closeComposerFromBackdrop = () => {
    if (hasComposerDraftContent()) {
      setShowComposerUnsavedPrompt(true);
      return;
    }

    setShowComposer(false);
  };

  const discardComposerDraft = () => {
    resetComposerDraft();
    setShowComposerUnsavedPrompt(false);
    setShowComposer(false);
  };

  const openAllCards = (sectionId) => {
    setExpandedSection(sectionId);
    setViewMode('all-cards');
  };

  const closeAllCards = () => {
    setExpandedSection(null);
    setViewMode('board');
  };

  const openChecklistToggle = (cardId, item, requestedState = '') => {
    const currentState =
      item.state || (item.checked ? CHECKLIST_STATES.COMPLETED : CHECKLIST_STATES.UNCHECKED);
    const nextState =
      requestedState ||
      (currentState === CHECKLIST_STATES.UNCHECKED
        ? CHECKLIST_STATES.IN_PROGRESS
        : currentState === CHECKLIST_STATES.IN_PROGRESS
          ? CHECKLIST_STATES.COMPLETED
          : CHECKLIST_STATES.UNCHECKED);

    if (requestedState) {
      toggleChecklistItem(cardId, item.id, item.context || '', {
        ...item,
        nextState,
        contextHistory: getChecklistContextHistory(item),
      });
      return;
    }

    setPendingToggle({
      cardId,
      itemId: item.id,
      nextState,
      nextChecked: nextState === CHECKLIST_STATES.COMPLETED,
      itemText: item.text,
      context: item.context || '',
      contextCreatedAt:
        item.contextCreatedAt || item.createdAt || item.completedAt || '',
      contextCompletedAt: item.contextCompletedAt || '',
      contextCreatedBy: item.contextCreatedBy || item.createdBy || '',
      contextHistory: getChecklistContextHistory(item),
      contextInput: '',
    });
  };

  const updatePendingToggleContextInput = (value) => {
    setPendingToggle((current) =>
      current ? { ...current, contextInput: value } : current
    );
  };

  const addPendingToggleContext = () => {
    setPendingToggle((current) =>
      current
        ? {
            ...addContextToChecklistItem(
              current,
              current.contextInput,
              getContextActor(currentUser)
            ),
            contextInput: '',
          }
        : current
    );
  };

  const deletePendingToggleCurrentContext = () => {
    setPendingToggle((current) =>
      current ? deleteCurrentChecklistContext(current) : current
    );
  };

  const deletePendingToggleHistoryContext = (index) => {
    setPendingToggle((current) =>
      current ? deleteChecklistHistoryContext(current, index) : current
    );
  };

  const confirmChecklistToggle = () => {
    if (!pendingToggle) {
      return;
    }

    toggleChecklistItem(
      pendingToggle.cardId,
      pendingToggle.itemId,
      pendingToggle.context,
      pendingToggle
    );
    setPendingToggle(null);
  };

  const confirmReopenCard = () => {
    if (!pendingReopenCardId) {
      return;
    }

    addChecklistItem(pendingReopenCardId);
    setPendingReopenCardId(null);
  };

  const confirmHoldMove = () => {
    if (!pendingHoldMove) {
      return;
    }

    moveCard(
      pendingHoldMove.cardId,
      'hold',
      pendingHoldMove.todoColumnId || ''
    );
    setPendingHoldMove(null);
  };

  const openChecklistEditor = (cardId, item) => {
    setEditingChecklistTarget({
      cardId,
      itemId: item.id,
      text: item.text || '',
      originalText: item.text || '',
      context: item.context || '',
      originalContext: item.context || '',
      contextCreatedAt:
        item.contextCreatedAt || item.createdAt || item.completedAt || '',
      originalContextCreatedAt:
        item.contextCreatedAt || item.createdAt || item.completedAt || '',
      contextCompletedAt: item.contextCompletedAt || '',
      originalContextCompletedAt: item.contextCompletedAt || '',
      contextCreatedBy: item.contextCreatedBy || item.createdBy || '',
      originalContextCreatedBy: item.contextCreatedBy || item.createdBy || '',
      contextHistory: getChecklistContextHistory(item),
      originalContextHistory: getChecklistContextHistory(item),
      contextInput: '',
    });
  };

  const updateChecklistEditorContextInput = (value) => {
    setEditingChecklistTarget((current) =>
      current ? { ...current, contextInput: value } : current
    );
  };

  const addChecklistEditorContext = () => {
    setEditingChecklistTarget((current) =>
      current
        ? {
            ...addContextToChecklistItem(
              current,
              current.contextInput,
              getContextActor(currentUser)
            ),
            contextInput: '',
          }
        : current
    );
  };

  const deleteChecklistEditorCurrentContext = () => {
    setEditingChecklistTarget((current) =>
      current ? deleteCurrentChecklistContext(current) : current
    );
  };

  const deleteChecklistEditorHistoryContext = (index) => {
    setEditingChecklistTarget((current) =>
      current ? deleteChecklistHistoryContext(current, index) : current
    );
  };

  const saveChecklistEditor = () => {
    if (!editingChecklistTarget) {
      return;
    }

    const targetCard = cards.find((card) => card.id === editingChecklistTarget.cardId);
    if (!targetCard) {
      setEditingChecklistTarget(null);
      return;
    }

    updateCard(targetCard.id, {
      checklist: targetCard.checklist.map((item) =>
        item.id === editingChecklistTarget.itemId
          ? {
              ...item,
              text: editingChecklistTarget.text,
              context: editingChecklistTarget.context,
              contextCreatedAt: editingChecklistTarget.contextCreatedAt || '',
              contextCompletedAt: editingChecklistTarget.contextCompletedAt || '',
              contextCreatedBy: editingChecklistTarget.contextCreatedBy || '',
              contextHistory: getChecklistContextHistory(editingChecklistTarget),
            }
          : item
      ),
    });
    setShowChecklistUnsavedPrompt(false);
    setEditingChecklistTarget(null);
  };

  const isChecklistEditorDirty = () => {
    if (!editingChecklistTarget) {
      return false;
    }

    return (
      editingChecklistTarget.text !== editingChecklistTarget.originalText ||
      editingChecklistTarget.context !== editingChecklistTarget.originalContext ||
      editingChecklistTarget.contextCreatedAt !==
        editingChecklistTarget.originalContextCreatedAt ||
      editingChecklistTarget.contextCompletedAt !==
        editingChecklistTarget.originalContextCompletedAt ||
      editingChecklistTarget.contextCreatedBy !==
        editingChecklistTarget.originalContextCreatedBy ||
      JSON.stringify(getChecklistContextHistory(editingChecklistTarget)) !==
        JSON.stringify(editingChecklistTarget.originalContextHistory || [])
    );
  };
  useUnsavedChangesWarning(isChecklistEditorDirty());

  const requestCloseChecklistEditor = () => {
    if (isChecklistEditorDirty()) {
      setShowChecklistUnsavedPrompt(true);
      return;
    }

    setEditingChecklistTarget(null);
  };

  const deleteChecklistEditorItem = () => {
    if (!editingChecklistTarget) {
      return;
    }

    const targetCard = cards.find((card) => card.id === editingChecklistTarget.cardId);
    if (!targetCard) {
      setEditingChecklistTarget(null);
      return;
    }

    const nextchecklist = targetCard.checklist.filter(
      (item) => item.id !== editingChecklistTarget.itemId
    );

    if (nextchecklist.length === 0) {
      deleteCard(targetCard.id);
    } else {
      updateCard(targetCard.id, { checklist: nextchecklist });
    }

    setShowChecklistUnsavedPrompt(false);
    setEditingChecklistTarget(null);
  };

  const toggleExportColumn = (key) => {
    setExportColumns((current) =>
      current.map((column) =>
        column.key === key ? { ...column, enabled: !column.enabled } : column
      )
    );
  };

  const moveExportColumn = (index, direction) => {
    setExportColumns((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const exportWorkbook = () => {
    const enabledColumns = exportColumns.filter((column) => column.enabled);
    if (enabledColumns.length === 0) {
      return;
    }

    const rows = cards.flatMap((card) => {
      const checklistRows =
        card.checklist.length > 0
          ? card.checklist
          : [
              {
                text: '',
                checked: false,
                checkedBy: '',
                createdAt: '',
                completedAt: '',
                context: '',
                createdBy: '',
              },
            ];

      return checklistRows.map((item) => ({
        taskName: card.taskName,
        jobName: card.jobName,
        lane: getCardZone(card),
        priority: card.priority || 1,
        assignedPerson: card.assignedPerson,
        startDate: card.startDate,
        checklistText: item.text,
        checklistChecked:
          item.state || (item.checked ? CHECKLIST_STATES.COMPLETED : CHECKLIST_STATES.UNCHECKED),
        checklistcreatedAt: item.createdAt || '',
        checklistCompletedAt: item.completedAt || '',
        checklistContext: item.context || '',
        checkedBy: item.checkedBy || '',
        createdBy: item.createdBy || '',
      }));
    });

    const orderedRows = rows.map((row) =>
      enabledColumns.reduce((result, column) => {
        result[column.label] = row[column.key];
        return result;
      }, {})
    );

    const worksheet = XLSX.utils.json_to_sheet(orderedRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'projectBoard');
    XLSX.writeFile(workbook, 'noteboard-export.xlsx');
    setShowExportConfig(false);
  };

  const importWorkbook = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {
        type: 'array',
        cellDates: true,
      });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: false,
      });
      const imported = buildCardsFromImportedRows(rows);

      if (imported.length === 0) {
        setImportStatus({
          type: 'error',
          message: 'no cards found. check that the file has project name or client name columns.',
        });
        return;
      }

      importCards(imported);
      setImportStatus({
        type: 'success',
        message: `${imported.length} card${imported.length === 1 ? '' : 's'} created from ${file.name}`,
      });
    } catch (error) {
      setImportStatus({
        type: 'error',
        message: 'could not read this file. try exporting a template first, then edit that file.',
      });
    }
  };

  if (!authReady) {
    return (
      <div className="login-gate">
        <div className="login-card">
          <p className="eyebrow">sml project note</p>
          <h2>loading board</h2>
          <p className="login-copy">connecting to the server...</p>
        </div>
      </div>
    );
  }

  if (!authToken) {
    return (
      <LoginGate
        mode={authMode}
        form={authForm}
        status={authStatus}
        loading={authLoading}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setAuthStatus('');
        }}
        onFormChange={(field, value) =>
          setAuthForm((current) => ({ ...current, [field]: value }))
        }
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <div className="app-shell" style={appAppearanceStyle}>
      <Header
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        viewMode={viewMode}
        sortMode={sortMode}
        sortOptions={SORT_OPTIONS}
        onMainPage={() => {
          setExpandedSection(null);
          setViewMode('board');
        }}
        onIncompleteCards={() => {
          setExpandedSection(null);
          setViewMode('incomplete');
        }}
        onExportExcel={() => {
          setImportStatus(null);
          setShowExportConfig(true);
        }}
        onSortChange={setSortMode}
        onSettings={() => setShowSettings(true)}
        onLogout={logout}
      />

      <WorkspaceTabs
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitch={switchWorkspace}
        onCreate={createClientWorkspace}
        onRename={renameWorkspace}
      />

      <DndContext
        sensors={sensors}
        onDragStart={(event) => {
          const cardId = event.active.id;
          hideHoverPreview();
          setActiveCardId(cardId);
          setFrontCardId(cardId);
          bringToFront(cardId);
        }}
        onDragEnd={(event) => {
          const cardId = event.active.id;
          const dropTarget = parseDropTarget(event.over?.id);
          const targetLane = isValidDropLane(dropTarget.lane) ? dropTarget.lane : '';
          const movingCard = cards.find((card) => card.id === cardId);
          const dragPoint = getDragPoint(event);
          const hasStatusDropIntent = isIntentionalStatusDrop(targetLane, dragPoint);

          if (
            targetLane === 'active' &&
            movingCard &&
            !getMissingFields(movingCard).length &&
            isCardComplete(movingCard)
          ) {
            setPendingReopenCardId(cardId);
          } else if (
            targetLane === 'hold' &&
            hasStatusDropIntent &&
            movingCard &&
            !getMissingFields(movingCard).length
          ) {
            setPendingHoldMove({
              cardId,
              todoColumnId: dropTarget.todoColumnId,
            });
          } else if (targetLane && hasStatusDropIntent) {
            moveCard(cardId, targetLane, dropTarget.todoColumnId);
          }

          setActiveCardId(null);
          hideHoverPreview();
        }}
        onDragCancel={() => {
          setActiveCardId(null);
          hideHoverPreview();
        }}
      >
        {viewMode === 'all-cards' && expandedSection ? (
          <AllCardsPage
            StaticCardComponent={StaticCard}
            lane={parseDropTarget(expandedSection).lane || expandedSection}
            title={
              expandedSection.startsWith('active:')
                ? todoColumns.find(
                    (column) =>
                      column.id === parseDropTarget(expandedSection).todoColumnId
                  )?.title || 'to do'
                : undefined
            }
            cards={
              expandedSection.startsWith('active:')
                ? lanes.activeByColumn[parseDropTarget(expandedSection).todoColumnId] || []
                : lanes[expandedSection]
            }
            onBack={closeAllCards}
            onOpenCard={(card) => setFocusCardId(card.id)}
            onAddChecklistItem={addChecklistItem}
            onRequestChecklistToggle={openChecklistToggle}
            onEditChecklistItem={openChecklistEditor}
            onHoverPreview={showHoverPreview}
            onHoverPreviewMove={moveHoverPreview}
            onHoverPreviewEnd={hideHoverPreview}
          />
        ) : viewMode === 'board' ? (
          (
            <BoardLayout
              CardSectionComponent={CardSection}
              lanes={lanes}
              todoColumns={todoColumns}
              createCard={(todoColumnId) => {
                setComposerDraft((current) => ({
                  ...current,
                  todoColumnId,
                }));
                setShowComposer(true);
              }}
              onOpenAllCards={openAllCards}
              setFocusCardId={setFocusCardId}
              addChecklistItem={addChecklistItem}
              onRequestChecklistToggle={openChecklistToggle}
              onEditChecklistItem={openChecklistEditor}
              onHoverPreview={showHoverPreview}
              onHoverPreviewMove={moveHoverPreview}
              onHoverPreviewEnd={hideHoverPreview}
            />
          )
        ) : (
          <IncompletePage
            CardSectionComponent={CardSection}
            lanes={lanes}
            onOpenAllCards={openAllCards}
            setFocusCardId={setFocusCardId}
            addChecklistItem={addChecklistItem}
            onRequestChecklistToggle={openChecklistToggle}
            onEditChecklistItem={openChecklistEditor}
            onHoverPreview={showHoverPreview}
            onHoverPreviewMove={moveHoverPreview}
            onHoverPreviewEnd={hideHoverPreview}
          />
        )}

        <DragOverlay dropAnimation={null} modifiers={DRAG_OVERLAY_MODIFIERS}>
          {activeDragCard ? (
            <div className="drag-overlay">
              <CardShell
                card={activeDragCard}
                isOverlay
                onClick={() => {}}
                onDoubleClick={() => {}}
                onAddChecklistItem={() => {}}
                onRequestChecklistToggle={() => {}}
                onPriorityChange={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {!activeCardId && hoverPreview && hoverPreviewCard ? (
        <div
          className="hover-card-preview"
          style={{
            left: hoverPreview.x,
            top: hoverPreview.y,
          }}
        >
          <CardShell
            card={hoverPreviewCard}
            forceFull
            isOverlay
            onClick={() => {}}
            onDoubleClick={() => {}}
            onAddChecklistItem={() => {}}
            onRequestChecklistToggle={() => {}}
            onEditChecklistItem={() => {}}
            onPriorityChange={() => {}}
          />
        </div>
      ) : null}

      <footer className="board-legend">
        <span>Vietnam {formatVietnamTime(footerNow)}</span>
        <span>{getVietnamDayPeriod(footerNow)}</span>
        <span>{formatTorontoDifference(footerNow)}</span>
      </footer>

      <CreateCardPopup
        open={showComposer}
        jobOptions={jobOptions}
        composerDraft={composerDraft}
        setComposerDraft={setComposerDraft}
        onSubmit={submitComposer}
        onOutsideCommit={closeComposerFromBackdrop}
        onCancel={() => setShowComposer(false)}
      />
      <UnsavedChangesModal
        open={showComposerUnsavedPrompt}
        onSave={() => submitComposer({ preventDefault() {} })}
        onDiscard={discardComposerDraft}
        onCancel={() => setShowComposerUnsavedPrompt(false)}
      />

      <FocusModal card={focusCard} onClose={() => setFocusCardId(null)} />
      <SettingsModal
        open={showSettings}
        preferences={appearancePreferences}
        onChange={updateUserPreferences}
        onClose={() => setShowSettings(false)}
      />
      <ChecklistItemModal
        key={
          editingChecklistTarget
            ? `edit-checklist-${editingChecklistTarget.cardId}-${editingChecklistTarget.itemId}`
            : 'edit-checklist-closed'
        }
        open={Boolean(editingChecklistTarget)}
        item={editingChecklistTarget}
        onTextChange={(text) =>
          setEditingChecklistTarget((current) =>
            current ? { ...current, text } : current
          )
        }
        contextInput={editingChecklistTarget?.contextInput || ''}
        onContextInputChange={updateChecklistEditorContextInput}
        onAddContext={addChecklistEditorContext}
        onDeleteCurrentContext={deleteChecklistEditorCurrentContext}
        onDeleteHistoryContext={deleteChecklistEditorHistoryContext}
        onSave={saveChecklistEditor}
        onDelete={deleteChecklistEditorItem}
        onCancel={requestCloseChecklistEditor}
      />
      <UnsavedChangesModal
        open={showChecklistUnsavedPrompt}
        onSave={saveChecklistEditor}
        onDiscard={() => {
          setShowChecklistUnsavedPrompt(false);
          setEditingChecklistTarget(null);
        }}
        onCancel={() => setShowChecklistUnsavedPrompt(false)}
      />
      <ChecklistConfirmModal
        key={
          pendingToggle
            ? `board-toggle-${pendingToggle.cardId}-${pendingToggle.itemId}-${pendingToggle.nextChecked ? 'check' : 'uncheck'}`
            : 'board-toggle-closed'
        }
        open={Boolean(pendingToggle)}
        nextChecked={pendingToggle?.nextChecked}
        nextState={pendingToggle?.nextState}
        itemText={pendingToggle?.itemText}
        contextItem={pendingToggle}
        contextInput={pendingToggle?.contextInput || ''}
        onContextInputChange={updatePendingToggleContextInput}
        onAddContext={addPendingToggleContext}
        onDeleteCurrentContext={deletePendingToggleCurrentContext}
        onDeleteHistoryContext={deletePendingToggleHistoryContext}
        onConfirm={confirmChecklistToggle}
        onCancel={() => setPendingToggle(null)}
      />
      <ExportConfigModal
        open={showExportConfig}
        columns={exportColumns}
        importStatus={importStatus}
        onToggleColumn={toggleExportColumn}
        onMoveColumn={moveExportColumn}
        onClose={() => setShowExportConfig(false)}
        onExport={exportWorkbook}
        onImportFile={importWorkbook}
      />
      <ReopenDoneCardModal
        open={Boolean(pendingReopenCard)}
        onConfirm={confirmReopenCard}
        onCancel={() => setPendingReopenCardId(null)}
      />
      <ConfirmMoveToHoldModal
        open={Boolean(pendingHoldMove)}
        cardTitle={
          pendingHoldMove
            ? cards.find((card) => card.id === pendingHoldMove.cardId)?.taskName ||
              cards.find((card) => card.id === pendingHoldMove.cardId)?.jobName ||
              ''
            : ''
        }
        onConfirm={confirmHoldMove}
        onCancel={() => setPendingHoldMove(null)}
      />
    </div>
  );
}

export default App;
