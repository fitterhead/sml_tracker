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
  getCardZone,
  isCardComplete,
  getMissingFields,
  useBoardStore,
} from './store/useBoardStore';

const STACK_LIMIT = 5;
const DATE_MATCHER =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/gi;
const EXPORT_FIELDS = [
  { key: 'taskName', label: 'Project name' },
  { key: 'jobName', label: 'Client name' },
  { key: 'lane', label: 'Lane' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignedPerson', label: 'Assigned person' },
  { key: 'startDate', label: 'Start date' },
  { key: 'checklistText', label: 'Checklist item' },
  { key: 'checklistChecked', label: 'Checked' },
  { key: 'checklistCompletedAt', label: 'Completed at' },
  { key: 'checklistContext', label: 'Checklist context' },
  { key: 'checkedBy', label: 'Checked by' },
  { key: 'createdBy', label: 'Created by' },
];

const columnMeta = {
  active: {
    title: 'To Do',
    subtitle: 'Ready to work',
  },
  done: {
    title: 'Done List',
    subtitle: 'Completed clients',
  },
  hold: {
    title: 'On Hold',
    subtitle: 'Paused for now',
  },
  incomplete: {
    title: 'Project Needs More Information',
    subtitle: 'Missing required project or client information',
  },
};

const formatDate = (value) => {
  if (!value) {
    return 'No date';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
};

const formatCompletedDate = (value) => {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
};

const formatChecklistTimeline = (item) => {
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

const formatContextHistoryTimeline = (entry) => {
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

const buildDraftFromCard = (card) => ({
  taskName: card.taskName,
  jobName: card.jobName,
  assignedPerson: card.assignedPerson,
  startDate: card.startDate,
  checklist: card.checklist.map((item) => ({
    ...item,
    createdAt: item.createdAt || item.completedAt || new Date().toISOString(),
    context: item.context || '',
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
            aria-label={`Set priority ${level}`}
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
  previousContextRecord,
  context,
  setContext,
  onUsePreviousContext,
  onConfirm,
  onCancel,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">{nextChecked ? 'Confirm Check' : 'Confirm Uncheck'}</p>
        <h2>{nextChecked ? 'Mark this item as complete?' : 'Remove this completed mark?'}</h2>
        <p className="confirm-item-text">
          <HighlightedText text={itemText || ''} />
        </p>
        {!nextChecked && previousContextRecord ? (
          <div className="confirm-context-history">
            <div className="confirm-context-head">
              <span>{formatContextHistoryTimeline(previousContextRecord)}</span>
              <button
                type="button"
                className="ghost-button muted"
                onClick={onUsePreviousContext}
              >
                Edit
              </button>
            </div>
            <p className="confirm-context-note">
              <HighlightedText text={previousContextRecord.note || ''} />
            </p>
          </div>
        ) : null}
        <label className="field field-full">
          <span>Context</span>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Add note, reason, or date context"
            rows={5}
          />
        </label>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportConfigModal({
  open,
  columns,
  onToggleColumn,
  onMoveColumn,
  onClose,
  onExport,
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
        <p className="eyebrow">Export Excel</p>
        <h2>Choose fields and column order</h2>
        <div className="export-table">
          <div className="export-table-head">
            <span>Include</span>
            <span>Column</span>
            <span>Order</span>
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
                  Up
                </button>
                <button
                  type="button"
                  className="ghost-button muted"
                  onClick={() => onMoveColumn(index, 1)}
                  disabled={index === columns.length - 1}
                >
                  Down
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={onExport}>
            Export
          </button>
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
        <p className="eyebrow">Create New Checklist</p>
        <h2>This card is already complete</h2>
        <p className="confirm-item-text">
          To move it back to To Do, create a new checklist item first.
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            Add checklist item
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
        <p className="eyebrow">Delete Checklist Item</p>
        <h2>Do you want to delete this item?</h2>
        <p className="confirm-item-text">
          <HighlightedText text={itemText || ''} />
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            Delete
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
        <p className="eyebrow">Delete Card</p>
        <h2>Do you want to delete this card?</h2>
        <p className="confirm-item-text">
          <HighlightedText text={cardTitle || ''} />
        </p>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({ searchTerm, setSearchTerm }) {
  const currentUser = useBoardStore((state) => state.currentUser);
  const setRole = useBoardStore((state) => state.setRole);

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">F</div>
        <div>
          <strong>SML Project Note</strong>
        </div>
      </div>

      <label className="search-bar">
        <span>Search</span>
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search projects, clients..."
        />
      </label>

      <div className="header-actions">
        <div className="role-toggle">
          <button
            type="button"
            className={currentUser.role === 'manager' ? 'active' : ''}
            onClick={() => setRole('manager')}
          >
            Manager
          </button>
          <button
            type="button"
            className={currentUser.role === 'staff' ? 'active' : ''}
            onClick={() => setRole('staff')}
          >
            Staff
          </button>
        </div>
        <div className="profile-chip">
          <span>{currentUser.name}</span>
          <small>{currentUser.role}</small>
        </div>
      </div>
    </header>
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
          aria-label={item.checked ? 'Uncheck item' : 'Check item'}
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
          <button
            type="button"
            className="check-context-toggle"
            onClick={onToggleContext}
          >
            <span>Context</span>
            <span>{expanded ? '−' : '+'}</span>
          </button>
          {expanded ? (
            <div className="check-context-body">
              {item.context?.trim() ? (
                <div className="context-entry">
                  <div className="context-entry-head">
                    <span className="context-entry-date">
                      {formatContextHistoryTimeline(item)}
                    </span>
                    {onDeleteCurrentContext ? (
                      <button
                        type="button"
                        className="ghost-button muted context-delete-button"
                        onClick={onDeleteCurrentContext}
                      >
                        Delete
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
                    <span className="context-entry-date">
                      {formatContextHistoryTimeline(entry)}
                    </span>
                    {onDeleteHistoryContext ? (
                      <button
                        type="button"
                        className="ghost-button muted context-delete-button"
                        onClick={() => onDeleteHistoryContext(index)}
                      >
                        Delete
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
  onClick,
  onDoubleClick,
  onAddChecklistItem,
  onRequestChecklistToggle,
  onPriorityChange,
  onEditChecklistItem,
}) {
  const missingFields = getMissingFields(card);
  const isOnHold = getCardZone(card) === 'hold';
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

  return (
    <article
      className={`job-card ${isOverlay ? 'overlay' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="card-top">
        <h3 title={card.jobName || 'CLIENT - (No Client Name)'}>
          <HighlightedText text={card.jobName || 'CLIENT - (No Client Name)'} />
        </h3>
        <p>
          <HighlightedText text={card.taskName || 'no project assigned yet'} />
        </p>
      </div>

      <div className="card-meta">
        <span className="meta-date">
          <HighlightedText text={formatDate(card.startDate)} />
        </span>
        <span>
          <HighlightedText text={card.assignedPerson || 'Unassigned'} />
        </span>
      </div>

      {missingFields.length > 0 ? (
        <div className="missing-box">
          Missing: <strong>{missingFields.join(', ')}</strong>
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
                placeholder="Checklist item"
                autoFocus
              />
              {showChecklistContextField ? (
                <textarea
                  value={newChecklistContext}
                  onChange={(event) => setNewChecklistContext(event.target.value)}
                  placeholder="Optional context"
                  rows={3}
                />
              ) : (
                <button
                  type="button"
                  className="ghost-button muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowChecklistContextField(true);
                  }}
                >
                  Add context
                </button>
              )}
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
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={submitChecklistItem}
                >
                  Add
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
              {isOnHold ? '+ Add checklist item and move to to do' : '+ Add checklist item'}
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
  onContextChange,
  onSave,
  onDelete,
  onCancel,
}) {
  if (!open || !item) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal checklist-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Checklist Item</p>
        <h2>Edit checklist item</h2>
        <label className="field field-full">
          <span>Item</span>
          <input
            value={item.text}
            onChange={(event) => onTextChange(event.target.value)}
            autoFocus
          />
        </label>
        <label className="field field-full">
          <span>Context</span>
          <textarea
            value={item.context}
            onChange={(event) => onContextChange(event.target.value)}
            rows={4}
            placeholder="Optional context"
          />
        </label>
        <div className="focus-actions">
          <button type="button" className="ghost-button muted" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DraggableCard(props) {
  const bringToFront = useBoardStore((state) => state.bringToFront);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: props.card.id,
      data: {
        cardId: props.card.id,
      },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: props.zIndex,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-card ${isDragging ? 'dragging' : ''}`}
      onMouseDown={() => bringToFront(props.card.id)}
      {...listeners}
      {...attributes}
    >
      <CardShell {...props} />
    </div>
  );
}

function StaticCard(props) {
  return (
    <div className="draggable-card static-card">
      <CardShell {...props} />
    </div>
  );
}

function DropColumn({ lane, count, children, className = '' }) {
  const { setNodeRef, isOver } = useDroppable({
    id: lane,
  });
  const meta = columnMeta[lane];

  return (
    <section
      ref={setNodeRef}
      className={`board-column ${className} ${isOver ? 'is-over' : ''}`}
    >
      <header className="column-header">
        <div>
          <h2>{meta.title}</h2>
          <p>{meta.subtitle}</p>
        </div>
        <span className={`count-pill lane-${lane}`}>{count}</span>
      </header>
      {children}
    </section>
  );
}

function CardSection({
  lane,
  cards,
  onCreateCard,
  onOpenAllCards,
  onOpenCard,
  onAddChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
}) {
  const meta = columnMeta[lane];
  const visibleCards = cards.slice(-STACK_LIMIT);
  const hiddenCount = Math.max(cards.length - STACK_LIMIT, 0);

  return (
    <DropColumn lane={lane} count={cards.length} className="plain-section">
      <div className="section-topline">
        {lane === 'active' ? (
          <button type="button" className="plus-button" onClick={onCreateCard}>
            +
          </button>
        ) : null}
        <div className="section-title-block">
          <h2>{meta.title}</h2>
          <span className="section-count">
            {cards.length > 0 ? `${cards.length} cards` : 'No cards'}
          </span>
        </div>
      </div>

      <div className={`pile-area lane-${lane}`}>
        {visibleCards.map((card, index) => (
          <div
            key={card.id}
            className="pile-slot"
            style={{
              transform: `translate(${index * 34}px, ${index * 42}px)`,
            }}
          >
            {lane === 'incomplete' ? (
              <StaticCard
                card={card}
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
              />
            ) : (
              <DraggableCard
                card={card}
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
              />
            )}
          </div>
        ))}
      </div>

      {hiddenCount > 0 ? (
        <button
          type="button"
          className="pile-more"
          onClick={(event) => {
            event.stopPropagation();
            onOpenAllCards(lane);
          }}
        >
          +{hiddenCount} more
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
}) {
  const submitComposerFromKeyboard = () => {
    onSubmit({ preventDefault() {} });
  };

  if (!open) {
    return null;
  }

  return (
    <div className="focus-backdrop" onClick={onCancel}>
      <form className="composer-popup" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <div className="composer-grid">
          <label className="field">
            <span>Project</span>
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
              placeholder="Project name"
            />
          </label>
          <label className="field">
            <span>Client</span>
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
              <option value="__new__">Add new client</option>
            </select>
          </label>
          {(!composerDraft.jobChoice || composerDraft.jobChoice === '__new__') ? (
            <label className="field field-full">
              <span>Add new client</span>
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
                placeholder="New client name"
              />
            </label>
          ) : null}
          <label className="field">
            <span>Assigned</span>
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
              placeholder="Person"
            />
          </label>
          <label className="field">
            <span>Date</span>
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
            Create
          </button>
          <button type="button" className="ghost-button muted" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function BoardLayout({
  lanes,
  createCard,
  onOpenAllCards,
  setFocusCardId,
  addChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
}) {
  return (
    <main className="board-row">
      <div className="row-slot row-todo">
        <CardSection
          lane="active"
          cards={lanes.active}
          onCreateCard={createCard}
          onOpenAllCards={onOpenAllCards}
          onOpenCard={(card) => setFocusCardId(card.id)}
          onAddChecklistItem={addChecklistItem}
          onRequestChecklistToggle={onRequestChecklistToggle}
          onEditChecklistItem={onEditChecklistItem}
        />
      </div>

      <div className="row-slot row-done">
        <CardSection
          lane="done"
          cards={lanes.done}
          onCreateCard={createCard}
          onOpenAllCards={onOpenAllCards}
          showComposer={false}
          onOpenCard={(card) => setFocusCardId(card.id)}
          onAddChecklistItem={addChecklistItem}
          onRequestChecklistToggle={onRequestChecklistToggle}
          onEditChecklistItem={onEditChecklistItem}
        />
      </div>

      <div className="row-slot row-hold">
        <CardSection
          lane="hold"
          cards={lanes.hold}
          onCreateCard={createCard}
          onOpenAllCards={onOpenAllCards}
          showComposer={false}
          onOpenCard={(card) => setFocusCardId(card.id)}
          onAddChecklistItem={addChecklistItem}
          onRequestChecklistToggle={onRequestChecklistToggle}
          onEditChecklistItem={onEditChecklistItem}
        />
      </div>
    </main>
  );
}

function IncompletePage({
  lanes,
  createCard,
  onOpenAllCards,
  setFocusCardId,
  addChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
}) {
  return (
    <main className="incomplete-page">
      <div className="incomplete-page-head">
        <h2>Project Needs More Information</h2>
        <p>These cards stay out of the main board until project name and client name are filled in.</p>
      </div>

      <div className="incomplete-page-body">
        <CardSection
          lane="incomplete"
          cards={lanes.incomplete}
          onCreateCard={createCard}
          onOpenAllCards={onOpenAllCards}
          showComposer={false}
          onOpenCard={(card) => setFocusCardId(card.id)}
          onAddChecklistItem={addChecklistItem}
          onRequestChecklistToggle={onRequestChecklistToggle}
          onEditChecklistItem={onEditChecklistItem}
        />
      </div>
    </main>
  );
}

function AllCardsPage({
  lane,
  cards,
  onBack,
  onOpenCard,
  onAddChecklistItem,
  onRequestChecklistToggle,
  onEditChecklistItem,
}) {
  const meta = columnMeta[lane];

  return (
    <main className="all-cards-page">
      <div className="all-cards-head">
        <button type="button" className="ghost-button" onClick={onBack}>
          Back
        </button>
        <div>
          <h2>{meta.title}</h2>
          <p>{cards.length} cards</p>
        </div>
      </div>
      <div className="all-cards-grid">
        {cards.map((card) => (
          lane === 'incomplete' ? (
            <StaticCard
              key={card.id}
              card={card}
              zIndex={10}
              onClick={() => onOpenCard(card)}
              onDoubleClick={() => {}}
              onAddChecklistItem={(text) => onAddChecklistItem(card.id, text)}
              onRequestChecklistToggle={(item) => onRequestChecklistToggle(card.id, item)}
              onEditChecklistItem={(item) => onEditChecklistItem(card.id, item)}
              onPriorityChange={(priority) =>
                useBoardStore.getState().updateCard(card.id, { priority })
              }
            />
          ) : (
            <DraggableCard
              key={card.id}
              card={card}
              zIndex={10}
              onClick={() => onOpenCard(card)}
              onDoubleClick={() => {}}
              onAddChecklistItem={(text) => onAddChecklistItem(card.id, text)}
              onRequestChecklistToggle={(item) => onRequestChecklistToggle(card.id, item)}
              onEditChecklistItem={(item) => onEditChecklistItem(card.id, item)}
              onPriorityChange={(priority) =>
                useBoardStore.getState().updateCard(card.id, { priority })
              }
            />
          )
        ))}
      </div>
    </main>
  );
}

function FocusModal({ card, onClose }) {
  const cards = useBoardStore((state) => state.cards);
  const updateCard = useBoardStore((state) => state.updateCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);
  const jobOptions = useMemo(
    () =>
      [...new Set(cards.map((item) => item.jobName.trim()).filter(Boolean))].sort(),
    [cards]
  );
  const [draft, setDraft] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [pendingDeleteCard, setPendingDeleteCard] = useState(false);
  const [showAddDraftChecklistComposer, setShowAddDraftChecklistComposer] = useState(false);
  const [newDraftChecklistText, setNewDraftChecklistText] = useState('');
  const [newDraftChecklistContext, setNewDraftChecklistContext] = useState('');

  useEffect(() => {
    if (!card) {
      setDraft(null);
      setPendingToggle(null);
      setPendingDeleteItem(null);
      setPendingDeleteCard(false);
      setShowAddDraftChecklistComposer(false);
      setNewDraftChecklistText('');
      setNewDraftChecklistContext('');
      return;
    }

    setDraft(buildDraftFromCard(card));
    setPendingToggle(null);
    setPendingDeleteItem(null);
    setPendingDeleteCard(false);
    setShowAddDraftChecklistComposer(false);
    setNewDraftChecklistText('');
    setNewDraftChecklistContext('');
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
    onClose();
  };

  const saveChangesFromKeyboard = () => {
    if (isDirty) {
      saveChanges();
    }
  };

  const openDraftChecklistToggle = (item) => {
    if (card.lane === 'hold') {
      return;
    }

    setPendingToggle({
      itemId: item.id,
      nextChecked: !item.checked,
      itemText: item.text,
      previousContextRecord:
        item.checked && item.context.trim()
          ? {
              note: item.context,
              createdAt: item.createdAt || '',
              completedAt: item.completedAt || '',
            }
          : null,
      context: item.context || '',
    });
  };

  const confirmDraftChecklistToggle = () => {
    if (!pendingToggle) {
      return;
    }

    const currentUserRole = useBoardStore.getState().currentUser.role;

    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === pendingToggle.itemId
          ? {
              ...item,
              checked: pendingToggle.nextChecked,
              checkedBy: pendingToggle.nextChecked ? currentUserRole : null,
              createdAt:
                item.createdAt || item.completedAt || new Date().toISOString(),
              completedAt: pendingToggle.nextChecked
                ? new Date().toISOString()
                : '',
              context: pendingToggle.context.trim(),
              contextHistory:
                item.context.trim() &&
                item.context.trim() !== pendingToggle.context.trim()
                  ? [
                      ...(item.contextHistory || []),
                      {
                        note: item.context,
                        createdAt: item.createdAt || '',
                        completedAt: item.completedAt || '',
                      },
                    ]
                  : item.contextHistory || [],
            }
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

  const updateDraftChecklistContext = (itemId, context) => {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === itemId ? { ...item, context } : item
      ),
    }));
  };

  const deleteDraftCurrentContext = (itemId) => {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === itemId ? { ...item, context: '' } : item
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

        const history = Array.isArray(item.contextHistory)
          ? item.contextHistory
          : [];
        const actualIndex = history.length - 1 - historyIndexFromNewest;

        return {
          ...item,
          contextHistory: history.filter((_, index) => index !== actualIndex),
        };
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
          contextHistory: [],
          createdBy: useBoardStore.getState().currentUser.role,
        },
      ],
    }));
    setShowAddDraftChecklistComposer(false);
    setNewDraftChecklistText('');
    setNewDraftChecklistContext('');
  };

  const confirmDeleteCard = () => {
    deleteCard(card.id);
    setPendingDeleteCard(false);
    onClose();
  };

  return (
    <div className="focus-backdrop" onClick={onClose}>
      <div className="focus-modal" onClick={(event) => event.stopPropagation()}>
        <div className="focus-header">
          <div>
            <p className="eyebrow">Focus Mode</p>
            <h2>
              <HighlightedText text={card.jobName || 'Untitled client'} />
            </h2>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="focus-grid">
          <label className="field">
            <span>Project name</span>
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
            <span>Client name</span>
            <select
              value={jobOptions.includes(draft.jobName) ? draft.jobName : '__custom__'}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  jobName:
                    event.target.value === '__custom__' ? '' : event.target.value,
                }))
              }
              onKeyDown={(event) =>
                triggerActionOnEnter(event, saveChangesFromKeyboard)
              }
            >
              <option value="">Select existing client</option>
              {jobOptions.map((jobName) => (
                <option key={jobName} value={jobName}>
                  {jobName}
                </option>
              ))}
              <option value="__custom__">Add new client</option>
            </select>
          </label>
          {!jobOptions.includes(draft.jobName) || draft.jobName === '' ? (
            <label className="field field-full">
              <span>Add new client</span>
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
          ) : null}

          <label className="field">
            <span>Assigned person</span>
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
            <span>Start date</span>
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
        </div>

        <div className="modal-checklist">
          <div className="modal-section-header">
            <h3>Priority</h3>
            <PriorityDots
              value={draft.priority || 0}
              onChange={(priority) =>
                setDraft((current) => ({ ...current, priority }))
              }
            />
          </div>
        </div>

        <div className="modal-checklist">
          <div className="modal-section-header">
            <h3>Checklist</h3>
            <button
              type="button"
              onClick={() => setShowAddDraftChecklistComposer((current) => !current)}
            >
              + Add item
            </button>
          </div>
          {showAddDraftChecklistComposer ? (
            <div className="modal-check-composer">
              <input
                value={newDraftChecklistText}
                onChange={(event) => setNewDraftChecklistText(event.target.value)}
                placeholder="Checklist item"
                autoFocus
              />
              <textarea
                value={newDraftChecklistContext}
                onChange={(event) =>
                  setNewDraftChecklistContext(event.target.value)
                }
                placeholder="Optional context"
                rows={3}
              />
              <div className="modal-check-composer-actions">
                <button
                  type="button"
                  className="ghost-button muted"
                  onClick={() => {
                    setShowAddDraftChecklistComposer(false);
                    setNewDraftChecklistText('');
                    setNewDraftChecklistContext('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={addDraftChecklistItem}
                >
                  Add
                </button>
              </div>
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
                  aria-label={item.checked ? 'Uncheck item' : 'Check item'}
                >
                  <span className={`check-mark ${item.checked ? 'filled' : ''}`} />
                </button>
                <input
                  value={item.text}
                  onChange={(event) =>
                    updateDraftChecklistItem(item.id, event.target.value)
                  }
                  className="modal-check-input"
                />
                {formatChecklistTimeline(item) ? (
                  <span className="check-date">{formatChecklistTimeline(item)}</span>
                ) : null}
              </div>
              <label className="field field-full modal-check-context-field">
                <span>Context</span>
                <textarea
                  value={item.context || ''}
                  onChange={(event) =>
                    updateDraftChecklistContext(item.id, event.target.value)
                  }
                  rows={3}
                  placeholder="Optional context"
                />
              </label>
              <div className="modal-check-actions">
                <button
                  type="button"
                  className="ghost-button muted"
                  onClick={() =>
                    setPendingDeleteItem({ id: item.id, text: item.text })
                  }
                >
                  Delete
                </button>
              </div>
              {Array.isArray(item.contextHistory) && item.contextHistory.length > 0 ? (
                <div className="modal-check-context">
                  <div className="check-context-body">
                    {item.contextHistory
                      .slice()
                      .reverse()
                      .map((entry, index) => (
                        <div
                          className="context-entry context-entry-history"
                          key={`${entry.createdAt}-${entry.completedAt}-${index}`}
                        >
                          <div className="context-entry-head">
                            <span className="context-entry-date">
                              {formatContextHistoryTimeline(entry)}
                            </span>
                            <button
                              type="button"
                              className="ghost-button muted context-delete-button"
                              onClick={() => deleteDraftHistoryContext(item.id, index)}
                            >
                              Delete
                            </button>
                          </div>
                          <p className="context-entry-note">
                            <HighlightedText text={entry.note || ''} />
                          </p>
                        </div>
                      ))}
                  </div>
                  {item.context?.trim() ? (
                    <div className="modal-check-context-clear">
                      <button
                        type="button"
                        className="ghost-button muted"
                        onClick={() => deleteDraftCurrentContext(item.id)}
                      >
                        Clear current context
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : item.context?.trim() ? (
                <div className="modal-check-context-clear">
                  <button
                    type="button"
                    className="ghost-button muted"
                    onClick={() => deleteDraftCurrentContext(item.id)}
                  >
                    Clear current context
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {isDirty ? (
          <div className="focus-actions">
            <button
              type="button"
              className="ghost-button muted"
              onClick={() => setPendingDeleteCard(true)}
            >
              Delete card
            </button>
            <button
              type="button"
              className="ghost-button muted"
              onClick={() => {
                setDraft(buildDraftFromCard(card));
                onClose();
              }}
            >
              Cancel
            </button>
            <button type="button" className="ghost-button" onClick={saveChanges}>
              Save
            </button>
          </div>
        ) : (
          <div className="focus-actions">
            <button
              type="button"
              className="ghost-button muted"
              onClick={() => setPendingDeleteCard(true)}
            >
              Delete card
            </button>
          </div>
        )}
      </div>
      <ChecklistConfirmModal
        open={Boolean(pendingToggle)}
        nextChecked={pendingToggle?.nextChecked}
        itemText={pendingToggle?.itemText}
        previousContextRecord={pendingToggle?.previousContextRecord}
        context={pendingToggle?.context || ''}
        setContext={(value) =>
          setPendingToggle((current) => (current ? { ...current, context: value } : current))
        }
        onUsePreviousContext={() =>
          setPendingToggle((current) =>
            current?.previousContextRecord
              ? { ...current, context: current.previousContextRecord.note || '' }
              : current
          )
        }
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
        cardTitle={draft.jobName || draft.taskName || 'Untitled card'}
        onConfirm={confirmDeleteCard}
        onCancel={() => setPendingDeleteCard(false)}
      />
    </div>
  );
}

function App() {
  const cards = useBoardStore((state) => state.cards);
  const createCard = useBoardStore((state) => state.createCard);
  const updateCard = useBoardStore((state) => state.updateCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const bringToFront = useBoardStore((state) => state.bringToFront);
  const addChecklistItem = useBoardStore((state) => state.addChecklistItem);
  const toggleChecklistItem = useBoardStore((state) => state.toggleChecklistItem);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCardId, setActiveCardId] = useState(null);
  const [focusCardId, setFocusCardId] = useState(null);
  const [viewMode, setViewMode] = useState('board');
  const [expandedLane, setExpandedLane] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showExportConfig, setShowExportConfig] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [pendingReopenCardId, setPendingReopenCardId] = useState(null);
  const [editingChecklistTarget, setEditingChecklistTarget] = useState(null);
  const [exportColumns, setExportColumns] = useState(() =>
    EXPORT_FIELDS.map((field) => ({ ...field, enabled: true }))
  );
  const [composerDraft, setComposerDraft] = useState({
    taskName: '',
    jobName: '',
    jobChoice: '',
    assignedPerson: '',
    startDate: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

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
      active: [],
      done: [],
      hold: [],
      incomplete: [],
    };

    [...filteredCards]
      .sort((a, b) => a.order - b.order)
      .forEach((card) => {
        grouped[getCardZone(card)].push(card);
      });

    return grouped;
  }, [filteredCards]);

  const focusCard = cards.find((card) => card.id === focusCardId) || null;
  const activeDragCard = cards.find((card) => card.id === activeCardId) || null;
  const pendingReopenCard =
    cards.find((card) => card.id === pendingReopenCardId) || null;
  const jobOptions = useMemo(
    () => [...new Set(cards.map((card) => card.jobName.trim()).filter(Boolean))].sort(),
    [cards]
  );

  const submitComposer = (event) => {
    event.preventDefault();
    createCard({
      taskName: composerDraft.taskName,
      jobName: composerDraft.jobName,
      assignedPerson: composerDraft.assignedPerson,
      startDate: composerDraft.startDate,
      lane: 'active',
    });
    setComposerDraft({
      taskName: '',
      jobName: '',
      jobChoice: '',
      assignedPerson: '',
      startDate: '',
    });
    setShowComposer(false);
  };

  const openAllCards = (lane) => {
    setExpandedLane(lane);
    setViewMode('all-cards');
  };

  const closeAllCards = () => {
    setExpandedLane(null);
    setViewMode('board');
  };

  const openChecklistToggle = (cardId, item) => {
    setPendingToggle({
      cardId,
      itemId: item.id,
      nextChecked: !item.checked,
      itemText: item.text,
      previousContextRecord:
        item.checked && item.context.trim()
          ? {
              note: item.context,
              createdAt: item.createdAt || '',
              completedAt: item.completedAt || '',
            }
          : null,
      context: item.context || '',
    });
  };

  const confirmChecklistToggle = () => {
    if (!pendingToggle) {
      return;
    }

    toggleChecklistItem(
      pendingToggle.cardId,
      pendingToggle.itemId,
      pendingToggle.context
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
      context: item.context || '',
    });
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
            }
          : item
      ),
    });
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

    const nextChecklist = targetCard.checklist.filter(
      (item) => item.id !== editingChecklistTarget.itemId
    );

    if (nextChecklist.length === 0) {
      deleteCard(targetCard.id);
    } else {
      updateCard(targetCard.id, { checklist: nextChecklist });
    }

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
        checklistChecked: item.checked ? 'Yes' : 'No',
        checklistCreatedAt: item.createdAt || '',
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ProjectBoard');
    XLSX.writeFile(workbook, 'noteboard-export.xlsx');
    setShowExportConfig(false);
  };

  return (
    <div className="app-shell">
      <Header
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />
      <div className="view-switcher">
        <button
          type="button"
          className={viewMode === 'board' ? 'active' : ''}
          onClick={() => {
            setExpandedLane(null);
            setViewMode('board');
          }}
        >
          Board
        </button>
        <button
          type="button"
          className={viewMode === 'incomplete' ? 'active' : ''}
          onClick={() => {
            setExpandedLane(null);
            setViewMode('incomplete');
          }}
        >
          Incomplete Info
        </button>
        <button type="button" onClick={() => setShowExportConfig(true)}>
          Export Excel
        </button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(event) => {
          const cardId = event.active.id;
          setActiveCardId(cardId);
          bringToFront(cardId);
        }}
        onDragEnd={(event) => {
          const cardId = event.active.id;
          const targetLane = event.over?.id;
          const movingCard = cards.find((card) => card.id === cardId);

          if (
            targetLane === 'active' &&
            movingCard &&
            !getMissingFields(movingCard).length &&
            isCardComplete(movingCard)
          ) {
            setPendingReopenCardId(cardId);
          } else if (targetLane) {
            moveCard(cardId, targetLane);
          }

          setActiveCardId(null);
        }}
        onDragCancel={() => setActiveCardId(null)}
      >
        {viewMode === 'all-cards' && expandedLane ? (
          <AllCardsPage
            lane={expandedLane}
            cards={lanes[expandedLane]}
            onBack={closeAllCards}
            onOpenCard={(card) => setFocusCardId(card.id)}
            onAddChecklistItem={addChecklistItem}
            onRequestChecklistToggle={openChecklistToggle}
            onEditChecklistItem={openChecklistEditor}
          />
        ) : viewMode === 'board' ? (
          (
            <BoardLayout
              lanes={lanes}
              createCard={() => setShowComposer(true)}
              onOpenAllCards={openAllCards}
              setFocusCardId={setFocusCardId}
              addChecklistItem={addChecklistItem}
              onRequestChecklistToggle={openChecklistToggle}
              onEditChecklistItem={openChecklistEditor}
            />
          )
        ) : (
          <IncompletePage
            lanes={lanes}
            createCard={createCard}
            onOpenAllCards={openAllCards}
            setFocusCardId={setFocusCardId}
            addChecklistItem={addChecklistItem}
            onRequestChecklistToggle={openChecklistToggle}
            onEditChecklistItem={openChecklistEditor}
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

      <footer className="board-legend">
        <span>Checked by manager</span>
        <span>Checked by staff</span>
        <span>Click a card to edit details</span>
      </footer>

      <CreateCardPopup
        open={showComposer}
        jobOptions={jobOptions}
        composerDraft={composerDraft}
        setComposerDraft={setComposerDraft}
        onSubmit={submitComposer}
        onCancel={() => setShowComposer(false)}
      />

      <FocusModal card={focusCard} onClose={() => setFocusCardId(null)} />
      <ChecklistItemModal
        open={Boolean(editingChecklistTarget)}
        item={editingChecklistTarget}
        onTextChange={(text) =>
          setEditingChecklistTarget((current) =>
            current ? { ...current, text } : current
          )
        }
        onContextChange={(context) =>
          setEditingChecklistTarget((current) =>
            current ? { ...current, context } : current
          )
        }
        onSave={saveChecklistEditor}
        onDelete={deleteChecklistEditorItem}
        onCancel={() => setEditingChecklistTarget(null)}
      />
      <ChecklistConfirmModal
        open={Boolean(pendingToggle)}
        nextChecked={pendingToggle?.nextChecked}
        itemText={pendingToggle?.itemText}
        previousContextRecord={pendingToggle?.previousContextRecord}
        context={pendingToggle?.context || ''}
        setContext={(value) =>
          setPendingToggle((current) => (current ? { ...current, context: value } : current))
        }
        onUsePreviousContext={() =>
          setPendingToggle((current) =>
            current?.previousContextRecord
              ? { ...current, context: current.previousContextRecord.note || '' }
              : current
          )
        }
        onConfirm={confirmChecklistToggle}
        onCancel={() => setPendingToggle(null)}
      />
      <ExportConfigModal
        open={showExportConfig}
        columns={exportColumns}
        onToggleColumn={toggleExportColumn}
        onMoveColumn={moveExportColumn}
        onClose={() => setShowExportConfig(false)}
        onExport={exportWorkbook}
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
