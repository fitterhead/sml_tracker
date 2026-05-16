import { useEffect, useMemo, useState } from 'react';
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
  getCardZone,
  isCardComplete,
  getMissingFields,
  useBoardStore,
} from './store/useBoardStore';

const DATE_MATCHER =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/gi;
const AUTH_TOKEN_KEY = 'sml-tracker-auth-token';

const readStoredAuthToken = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
};

const createEmptyServerMeta = () => ({
  lastLoginAt: '',
  cardsCreatedToday: 0,
  changesToday: 0,
  boardUpdatedAt: '',
  usersCount: 0,
  cardsCount: 0,
});

const formatFooterTime = (value) => {
  if (!value) {
    return 'never';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};
const EXPORT_FIELDS = [
  { key: 'taskName', label: 'project name' },
  { key: 'jobName', label: 'client name' },
  { key: 'lane', label: 'lane' },
  { key: 'priority', label: 'priority' },
  { key: 'assignedPerson', label: 'assigned person' },
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
    const priority = Number(getImportValue(row, 'priority')) || 0;
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
  priority: card.priority || 0,
});

const triggerActionOnEnter = (event, action) => {
  if (event.key !== 'Enter' || event.shiftKey) {
    return;
  }

  event.preventDefault();
  action();
};

const getChecklistContextHistory = (item = {}) =>
  Array.isArray(item.contextHistory) ? item.contextHistory : [];

const hasChecklistContext = (item = {}) =>
  Boolean(item?.context?.trim()) || getChecklistContextHistory(item).length > 0;

const getContextActor = (user = {}) =>
  user.name || user.email || user.role || 'unknown';

const addContextToChecklistItem = (item = {}, noteValue = '', actor = '') => {
  const note = String(noteValue || '').trim();

  if (!note) {
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
  const value = String(text);
  const matches = [...value.matchAll(DATE_MATCHER)];

  if (matches.length === 0) {
    return value;
  }

  const parts = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const matchText = match[0];

    if (start > cursor) {
      parts.push(value.slice(cursor, start));
    }

    parts.push(
      <mark key={`${matchText}-${start}-${index}`} className="date-highlight">
        {matchText}
      </mark>
    );
    cursor = start + matchText.length;
  });

  if (cursor < value.length) {
    parts.push(value.slice(cursor));
  }

  return parts;
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

  return (
    <div className="modal-check-context">
      <div className="context-composer">
        <label className="field field-full modal-check-context-field">
          <span>new context</span>
          <textarea
            value={inputValue || ''}
            onChange={(event) => onInputChange(event.target.value)}
            rows={2}
            placeholder="type a context note"
          />
        </label>
        <button
          type="button"
          className="ghost-button"
          onClick={onAddContext}
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
        <p className="eyebrow">{nextChecked ? 'confirm check' : 'confirm uncheck'}</p>
        <h2>{nextChecked ? 'mark this item as complete?' : 'remove this completed mark?'}</h2>
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
              <small>supports project name, client name, assigned person, start date, priority, lane, checklist item, context</small>
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
  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">delete checklist item</p>
        <h2>do you want to delete this item?</h2>
        <p className="confirm-item-text">
          <HighlightedText text={itemText || ''} />
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            delete
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteCardModal({ open, cardTitle, onConfirm, onCancel }) {
  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">delete card</p>
        <h2>do you want to delete this card?</h2>
        <p className="confirm-item-text">
          <HighlightedText text={cardTitle || ''} />
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>CANCEL</button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            delete
          </button>
        </div>
      </div>
    </div>
  );
}

function UnsavedChangesModal({ open, onSave, onExit, onCancel }) {
  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop nested-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">unsaved changes</p>
        <h2>do you want to exit?</h2>
        <p className="confirm-item-text">
          You have unsaved changes. Save them before leaving, or exit without saving.
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onExit}>
            exit
          </button>
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            stay
          </button>
          <button type="button" className="ghost-button" onClick={onSave}>
            save
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
  onToggle,
  disabled = false,
  expanded = false,
  onToggleContext,
  onDeleteCurrentContext,
  onDeleteHistoryContext,
  onEdit,
}) {
  const checkedClass = item.checkedBy ? `checked-${item.checkedBy}` : '';
  const historyEntries = Array.isArray(item.contextHistory)
    ? [...item.contextHistory].reverse()
    : [];
  const hasContext =
    Boolean(item.context?.trim()) || historyEntries.length > 0;

  return (
    <div className={`check-entry ${item.checked ? checkedClass : ''}`}>
      <div className="check-item">
        <button
          type="button"
          className="check-toggle"
          onClick={onToggle}
          disabled={disabled}
          aria-label={item.checked ? 'uncheck item' : 'check item'}
        >
          <span className={`check-mark ${item.checked ? 'filled' : ''}`} />
        </button>
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
  const cardZone = getCardZone(card);
  const isOnHold = cardZone === 'hold';
  const isCompact = !forceFull && (cardZone === 'hold' || cardZone === 'done');
  const [expandedContexts, setExpandedContexts] = useState({});
  const [showAddChecklistComposer, setShowAddChecklistComposer] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistContext, setNewChecklistContext] = useState('');
  const [showChecklistContextField, setShowChecklistContextField] = useState(false);

  const submitChecklistItem = (event) => {
    event.stopPropagation();
    const trimmedText = newChecklistText.trim();
    if (!trimmedText) {
      return;
    }

    onAddChecklistItem({
      text: trimmedText,
      context: newChecklistContext,
    });
    setNewChecklistText('');
    setNewChecklistContext('');
    setShowChecklistContextField(false);
    setShowAddChecklistComposer(false);
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
          <p>
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
        <p>
          <HighlightedText text={card.taskName || 'no project assigned yet'} />
        </p>
      </div>

      <div className="card-meta">
        <span className="meta-date">
          <HighlightedText
            text={formatCardDisplayDate(card.startDate, card.createdAt)}
          />
        </span>
        <span>
          <HighlightedText text={card.assignedPerson || 'unassigned'} />
        </span>
      </div>

      {missingFields.length > 0 ? (
        <div className="missing-box">
          missing: <strong>{missingFields.join(', ')}</strong>
        </div>
      ) : (
        <div className="checklist">
          {card.checklist.map((item) => (
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
              onToggle={(event) => {
                event.stopPropagation();
                if (!isOnHold) {
                  onRequestChecklistToggle(item);
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
              className="inline-checklist-composer"
              onClick={(event) => event.stopPropagation()}
            >
              <input
                value={newChecklistText}
                onChange={(event) => setNewChecklistText(event.target.value)}
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
                    setShowAddChecklistComposer(false);
                    setNewChecklistText('');
                    setNewChecklistContext('');
                    setShowChecklistContextField(false);
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
          value={card.priority || 0}
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
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-card ${isDragging ? 'dragging' : ''} ${
        props.isFrontCard ? 'front-card' : 'hover-lift-card'
      }`}
      onMouseEnter={(event) => {
        if (isCardHeaderTarget(event.target)) {
          props.onHoverPreview?.(props.card, event);
        }
      }}
      onMouseMove={(event) => {
        if (!isCardHeaderTarget(event.target)) {
          props.onHoverPreviewEnd?.();
          return;
        }

        props.onHoverPreviewMove?.(event);
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
        if (isCardHeaderTarget(event.target)) {
          props.onHoverPreview?.(props.card, event);
        }
      }}
      onMouseMove={(event) => {
        if (!isCardHeaderTarget(event.target)) {
          props.onHoverPreviewEnd?.();
          return;
        }

        props.onHoverPreviewMove?.(event);
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
  const hiddenCount = Math.max(cards.length - stackLimit, 0);
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
            <span className="section-count">
              {cards.length > 0 ? `${cards.length} cards` : 'no cards'}
            </span>
          </div>
          </>
        ) : null}
      </div>

      <div className={`pile-area lane-${lane}`} style={{ minHeight: pileHeight }}>
        {visibleCards.map((card, index) => {
          const layout = getPileLayout(lane, visibleCards.length, index);

          return (
            <div
              key={card.id}
              className="pile-slot"
              style={{
                transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.scale})`,
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
                  onRequestChecklistToggle={(item) =>
                    onRequestChecklistToggle(card.id, item)
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
                  onRequestChecklistToggle={(item) =>
                    onRequestChecklistToggle(card.id, item)
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

      {showSeeMore && hiddenCount > 0 ? (
        <button
          type="button"
          className="pile-more"
          onClick={(event) => {
            event.stopPropagation();
            onOpenAllCards(sectionId || lane);
          }}
        >
          See more
        </button>
      ) : null}

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
                placeholder="new client name"
              />
            </label>
          ) : null}
          <label className="field">
            <span>assigned</span>
            <input
              value={composerDraft.assignedPerson}
              onChange={(event) =>
                setComposerDraft((draft) => ({
                  ...draft,
                  assignedPerson: event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, submitComposerFromKeyboard)
              }
              placeholder="person"
            />
          </label>
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
  const [newDraftChecklistText, setNewDraftChecklistText] = useState('');
  const [newDraftChecklistContext, setNewDraftChecklistContext] = useState('');
  const [showNewDraftChecklistContext, setShowNewDraftChecklistContext] = useState(false);
  const [draftContextInputs, setDraftContextInputs] = useState({});
  const [clientRenameDraft, setClientRenameDraft] = useState('');
  const [editingDraftChecklistId, setEditingDraftChecklistId] = useState(null);
  const [showUnsavedExit, setShowUnsavedExit] = useState(false);

  useEffect(() => {
    if (!card) {
      setDraft(null);
      setPendingToggle(null);
      setExpandedDraftContexts({});
      setPendingDeleteItem(null);
      setPendingDeleteCard(false);
      setShowAddDraftChecklistComposer(false);
      setNewDraftChecklistText('');
      setNewDraftChecklistContext('');
      setShowNewDraftChecklistContext(false);
      setDraftContextInputs({});
      setClientRenameDraft('');
      setEditingDraftChecklistId(null);
      setShowUnsavedExit(false);
      return;
    }

    setDraft(buildDraftFromCard(card));
    setPendingToggle(null);
    setExpandedDraftContexts({});
    setPendingDeleteItem(null);
    setPendingDeleteCard(false);
    setShowAddDraftChecklistComposer(false);
    setNewDraftChecklistText('');
    setNewDraftChecklistContext('');
    setShowNewDraftChecklistContext(false);
    setDraftContextInputs({});
    setClientRenameDraft(card.jobName || '');
    setEditingDraftChecklistId(null);
    setShowUnsavedExit(false);
  }, [card]);

  if (!card || !draft) {
    return null;
  }

  const cleanCardDraft = buildDraftFromCard(card);
  const isDirty =
    JSON.stringify(cleanCardDraft) !== JSON.stringify(draft);

  const saveChanges = () => {
    const nextLane =
      card.lane === 'hold' && draft.checklist.length > card.checklist.length
        ? 'active'
        : card.lane;

    updateCard(card.id, {
      taskName: draft.taskName,
      jobName: draft.jobName,
      assignedPerson: draft.assignedPerson,
      startDate: draft.startDate,
      priority: draft.priority,
      lane: nextLane,
      checklist: draft.checklist,
    });
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
      assignedPerson: draft.assignedPerson,
      startDate: draft.startDate,
      priority: draft.priority,
      checklist: draft.checklist,
    });
    moveCard(card.id, targetLane, todoColumns[0]?.id || '');
    onClose();
  };

  const openDraftChecklistToggle = (item) => {
    if (card.lane === 'hold') {
      return;
    }

    setPendingToggle({
      itemId: item.id,
      nextChecked: !item.checked,
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
              const completedAt = pendingToggle.nextChecked
                ? new Date().toISOString()
                : '';

              return {
                ...item,
                checked: pendingToggle.nextChecked,
                checkedBy: pendingToggle.nextChecked ? currentUserRole : null,
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

  const addDraftChecklistContext = (itemId) => {
    const note = String(draftContextInputs[itemId] || '').trim();

    if (!note) {
      return;
    }

    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        return addContextToChecklistItem(item, note, getContextActor(currentUser));
      }),
    }));
    setDraftContextInputs((current) => ({
      ...current,
      [itemId]: '',
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

  const deleteDraftChecklistItem = (itemId) => {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.filter((item) => item.id !== itemId),
    }));
  };

  const confirmDeleteDraftChecklistItem = () => {
    if (!pendingDeleteItem) {
      return;
    }

    deleteDraftChecklistItem(pendingDeleteItem.id);
    setPendingDeleteItem(null);
  };

  const addDraftChecklistItem = () => {
    const trimmedText = newDraftChecklistText.trim();
    if (!trimmedText) {
      return;
    }

    const tempId = `draft-${Date.now()}`;
    setDraft((current) => ({
      ...current,
      checklist: [
        ...current.checklist,
        {
          id: tempId,
          text: trimmedText,
          checked: false,
          checkedBy: null,
          createdAt: new Date().toISOString(),
          completedAt: '',
          context: newDraftChecklistContext.trim(),
          contextCreatedAt: newDraftChecklistContext.trim()
            ? new Date().toISOString()
            : '',
          contextCompletedAt: '',
          contextCreatedBy: newDraftChecklistContext.trim()
            ? getContextActor(currentUser)
            : '',
          contextHistory: [],
          createdBy: useBoardStore.getState().currentUser.role,
        },
      ],
    }));
    setShowAddDraftChecklistComposer(false);
    setNewDraftChecklistText('');
    setNewDraftChecklistContext('');
    setShowNewDraftChecklistContext(false);
  };

  const confirmDeleteCard = () => {
    deleteCard(card.id);
    setPendingDeleteCard(false);
    onClose();
  };

  return (
    <div className="focus-backdrop" onClick={closeFocusModal}>
      <div className="focus-modal" onClick={(event) => event.stopPropagation()}>
        <div className="focus-header">
          <div>
            <p className="eyebrow">focus mode</p>
            <h2>
              <HighlightedText text={card.jobName || 'untitled client'} />
            </h2>
          </div>
          <button type="button" className="close-button" onClick={closeFocusModal}>CLOSE</button>
        </div>

        <div className="focus-grid">
          <label className="field">
            <span>project name</span>
            <input
              value={draft.taskName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  taskName: event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, saveChangesFromKeyboard)
              }
            />
          </label>

          <label className="field">
            <span>client name</span>
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
                triggerActionOnEnter(event, saveChangesFromKeyboard)
              }
            >
              <option value="">select existing client</option>
              {jobOptions.map((jobName) => (
                <option key={jobName} value={jobName}>
                  {jobName}
                </option>
              ))}
              <option value="__custom__">add new client</option>
            </select>
          </label>
          {!jobOptions.includes(draft.jobName) || draft.jobName === '' ? (
            <label className="field field-full">
              <span>add new client</span>
              <input
                value={draft.jobName}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    jobName: event.target.value,
                  }))
                }
                onKeyDown={(event) =>
                  triggerActionOnEnter(event, saveChangesFromKeyboard)
                }
              />
            </label>
          ) : (
            <div className="field field-full client-rename-field">
              <span>rename selected client</span>
              <div className="client-rename-row">
                <input
                  value={clientRenameDraft}
                  onChange={(event) => setClientRenameDraft(event.target.value)}
                  onKeyDown={(event) =>
                    triggerActionOnEnter(event, renameSelectedClient)
                  }
                />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={renameSelectedClient}
                  disabled={!clientRenameDraft.trim()}
                >
                  rename
                </button>
              </div>
            </div>
          )}

          <label className="field">
            <span>assigned person</span>
            <input
              value={draft.assignedPerson}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  assignedPerson: event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, saveChangesFromKeyboard)
              }
            />
          </label>

          <label className="field">
            <span>start date</span>
            <input
              type="date"
              value={draft.startDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, saveChangesFromKeyboard)
              }
            />
          </label>

          <div className="modal-checklist focus-priority">
            <div className="modal-section-header">
              <h3>priority</h3>
              <PriorityDots
                value={draft.priority || 0}
                onChange={(priority) =>
                  setDraft((current) => ({ ...current, priority }))
                }
              />
            </div>
          </div>

          <div className="modal-checklist focus-checklist">
            <div className="modal-section-header">
              <h3>checklist</h3>
              <button
                type="button"
                onClick={() => setShowAddDraftChecklistComposer((current) => !current)}
              >
                + add item
              </button>
            </div>
            {showAddDraftChecklistComposer ? (
              <div className="modal-check-composer">
                <div className="modal-check-composer-row">
                  <input
                    value={newDraftChecklistText}
                    onChange={(event) => setNewDraftChecklistText(event.target.value)}
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
                    onClick={addDraftChecklistItem}
                  >
                    add
                  </button>
                  <button
                    type="button"
                    className="ghost-button muted"
                    onClick={() => {
                      setShowAddDraftChecklistComposer(false);
                      setNewDraftChecklistText('');
                      setNewDraftChecklistContext('');
                      setShowNewDraftChecklistContext(false);
                    }}
                  >CANCEL</button>
                </div>
                {showNewDraftChecklistContext ? (
                  <textarea
                    value={newDraftChecklistContext}
                    onChange={(event) =>
                      setNewDraftChecklistContext(event.target.value)
                    }
                    placeholder="type a context note"
                    rows={2}
                  />
                ) : null}
              </div>
            ) : null}
            {draft.checklist.map((item) => (
              <div className="modal-check-editor" key={item.id}>
                <div className="modal-check-main">
                  <button
                    type="button"
                    className="check-toggle"
                    onClick={() => openDraftChecklistToggle(item)}
                    disabled={card.lane === 'hold'}
                    aria-label={item.checked ? 'uncheck item' : 'check item'}
                  >
                    <span className={`check-mark ${item.checked ? 'filled' : ''}`} />
                  </button>
                  {editingDraftChecklistId === item.id ? (
                    <input
                      value={item.text}
                      onChange={(event) =>
                        updateDraftChecklistItem(item.id, event.target.value)
                      }
                      onBlur={() => setEditingDraftChecklistId(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          setEditingDraftChecklistId(null);
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
                {expandedDraftContexts[item.id] ? (
                  <ContextThreadEditor
                    item={item}
                    inputValue={draftContextInputs[item.id] || ''}
                    onInputChange={(context) =>
                      updateDraftContextInput(item.id, context)
                    }
                    onAddContext={() => addDraftChecklistContext(item.id)}
                    onDeleteCurrentContext={() =>
                      deleteDraftCurrentContext(item.id)
                    }
                    onDeleteHistoryContext={(index) =>
                      deleteDraftHistoryContext(item.id, index)
                    }
                  />
                ) : null}
              </div>
            ))}
          </div>
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
              <button type="button" className="ghost-button" onClick={saveChanges}>SAVE</button>
            </div>
          ) : null}
        </div>
      </div>
      <ChecklistConfirmModal
        key={
          pendingToggle
            ? `focus-toggle-${pendingToggle.itemId}-${pendingToggle.nextChecked ? 'check' : 'uncheck'}`
            : 'focus-toggle-closed'
        }
        open={Boolean(pendingToggle)}
        nextChecked={pendingToggle?.nextChecked}
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
      <UnsavedChangesModal
        open={showUnsavedExit}
        onSave={saveAndCloseFocusModal}
        onExit={() => {
          setShowUnsavedExit(false);
          onClose();
        }}
        onCancel={() => setShowUnsavedExit(false)}
      />
    </div>
  );
}

function App() {
  const cards = useBoardStore((state) => state.cards);
  const todoColumns = useBoardStore((state) => state.todoColumns);
  const currentUser = useBoardStore((state) => state.currentUser);
  const createCard = useBoardStore((state) => state.createCard);
  const importCards = useBoardStore((state) => state.importCards);
  const updateCard = useBoardStore((state) => state.updateCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const bringToFront = useBoardStore((state) => state.bringToFront);
  const addChecklistItem = useBoardStore((state) => state.addChecklistItem);
  const toggleChecklistItem = useBoardStore((state) => state.toggleChecklistItem);
  const hydrateBoard = useBoardStore((state) => state.hydrateBoard);
  const logoutUser = useBoardStore((state) => state.logoutUser);
  const [searchTerm, setSearchTerm] = useState('');
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
  const [editingChecklistTarget, setEditingChecklistTarget] = useState(null);
  const [authToken, setAuthToken] = useState(readStoredAuthToken);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [boardHydrated, setBoardHydrated] = useState(false);
  const [serverBoardUpdatedAt, setServerBoardUpdatedAt] = useState('');
  const [serverMeta, setServerMeta] = useState(createEmptyServerMeta);
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
    assignedPerson: '',
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
      saveBoardRequest(authToken, { cards, todoColumns }, serverBoardUpdatedAt)
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
          fetchSession(authToken)
            .then((session) => {
              hydrateBoard(session.board, session.user);
              setServerBoardUpdatedAt(session.board?.updatedAt || '');
              setServerMeta({
                ...createEmptyServerMeta(),
                ...(session.meta || {}),
              });
            })
            .catch(() => {});
        });
    }, 700);

    return () => window.clearTimeout(syncTimer);
  }, [
    authToken,
    authReady,
    boardHydrated,
    cards,
    todoColumns,
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

  const filteredCards = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return cards;
    }

    return cards.filter((card) =>
      [card.taskName, card.jobName, card.assignedPerson]
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

    return grouped;
  }, [filteredCards, todoColumns]);

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
      card,
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

  const submitComposer = (event) => {
    event.preventDefault();
    createCard({
      taskName: composerDraft.taskName,
      jobName: composerDraft.jobName,
      assignedPerson: composerDraft.assignedPerson,
      startDate: composerDraft.startDate,
      lane: 'active',
      todoColumnId: composerDraft.todoColumnId || todoColumns[0]?.id || '',
    });
    setComposerDraft({
      taskName: '',
      jobName: '',
      jobChoice: '',
      assignedPerson: '',
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
      assignedPerson: '',
      startDate: '',
      todoColumnId: '',
    });
  };

  const hasComposerDraftContent = () =>
    Boolean(
      composerDraft.taskName.trim() ||
        composerDraft.jobName.trim() ||
        composerDraft.assignedPerson.trim() ||
        composerDraft.startDate
    );

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

  const openChecklistToggle = (cardId, item) => {
    setPendingToggle({
      cardId,
      itemId: item.id,
      nextChecked: !item.checked,
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
        priority: card.priority || 0,
        assignedPerson: card.assignedPerson,
        startDate: card.startDate,
        checklistText: item.text,
        checklistChecked: item.checked ? 'yes' : 'no',
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
    <div className="app-shell">
      <Header
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        viewMode={viewMode}
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
        onLogout={logout}
      />

      <DndContext
        sensors={sensors}
        onDragStart={(event) => {
          const cardId = event.active.id;
          setActiveCardId(cardId);
          bringToFront(cardId);
        }}
        onDragEnd={(event) => {
          const cardId = event.active.id;
          const dropTarget = parseDropTarget(event.over?.id);
          const targetLane = isValidDropLane(dropTarget.lane) ? dropTarget.lane : '';
          const movingCard = cards.find((card) => card.id === cardId);

          if (
            targetLane === 'active' &&
            movingCard &&
            !getMissingFields(movingCard).length &&
            isCardComplete(movingCard)
          ) {
            setPendingReopenCardId(cardId);
          } else if (targetLane) {
            moveCard(cardId, targetLane, dropTarget.todoColumnId);
          }

          setActiveCardId(null);
        }}
        onDragCancel={() => setActiveCardId(null)}
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

        <DragOverlay>
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

      {hoverPreview ? (
        <div
          className="hover-card-preview"
          style={{
            left: hoverPreview.x,
            top: hoverPreview.y,
          }}
        >
          <CardShell
            card={hoverPreview.card}
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
        <span>checked by manager</span>
        <span>checked by staff</span>
        <span>last login {formatFooterTime(serverMeta.lastLoginAt)}</span>
        <span>today cards {serverMeta.cardsCreatedToday}</span>
        <span>changes {serverMeta.changesToday}</span>
        <span>click a card to edit details</span>
        {syncStatus ? <span>{syncStatus}</span> : null}
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
        onExit={discardComposerDraft}
        onCancel={() => setShowComposerUnsavedPrompt(false)}
      />

      <FocusModal card={focusCard} onClose={() => setFocusCardId(null)} />
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
        onExit={() => {
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
    </div>
  );
}

export default App;
