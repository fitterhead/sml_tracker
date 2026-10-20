import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { toEditorDocument } from './lib/richText';
import { useBoardStore } from './store/useBoardStore';

beforeEach(() => {
  localStorage.setItem('sml-tracker-auth-token', 'test-token');
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'test-token',
      user: {
        name: 'Andrew',
        role: 'manager',
      },
      board: {
        todoColumns: [
          { id: 'todo-1', title: 'To Do' },
          { id: 'todo-2', title: 'To Do 2' },
        ],
        cards: [],
      },
    }),
  });
});

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test('renders board view', async () => {
  render(<App />);
  const titleElement = await screen.findByRole('button', {
    name: /SML Project Note/i,
  });
  expect(titleElement).toBeInTheDocument();
});

test('opens workspace filter menu', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /^Tools/i }));
  const filterButton = screen.getByRole('button', { name: /filter/i });

  fireEvent.click(filterButton);

  expect(
    screen.getByRole('menuitem', { name: /sort by client name a -> z/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: /sort by created date newest -> oldest/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: /sort by priority high to front/i })
  ).toBeInTheDocument();
});

test('footer shows vietnam time with am or pm', async () => {
  render(<App />);

  expect(await screen.findByText(/^Vietnam /i)).toHaveTextContent(/\b(AM|PM)\b/);
});

test('account menu opens settings and logout options', async () => {
  render(<App />);

  const accountButton = await screen.findByRole('button', { name: /andrew manager/i });
  fireEvent.click(accountButton);

  expect(screen.queryByRole('menuitem', { name: /settings/i })).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
});

test('settings can update account appearance preferences', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /^Tools/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /settings/i }));

  const textColorInput = screen.getByLabelText(/text color/i);
  fireEvent.change(textColorInput, { target: { value: '#224466' } });

  expect(document.querySelector('.app-shell')).toHaveStyle('--text: #224466');
});

test('priority high sorting moves high priority cards to the front of the stack', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'test-token',
      user: {
        name: 'Andrew',
        role: 'manager',
      },
      board: {
        todoColumns: [
          { id: 'todo-1', title: 'To Do' },
          { id: 'todo-2', title: 'To Do 2' },
        ],
        cards: [
          {
            id: 'high-priority',
            taskName: 'High priority project',
            jobName: 'Important client',
            lane: 'active',
            todoColumnId: 'todo-1',
            order: 1,
            priority: 5,
            createdAt: '2026-01-01T00:00:00.000Z',
            checklist: [
              {
                id: 'high-item',
                text: 'high item',
                state: 'unchecked',
                checked: false,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
          {
            id: 'low-priority',
            taskName: 'Low priority project',
            jobName: 'Regular client',
            lane: 'active',
            todoColumnId: 'todo-1',
            order: 2,
            priority: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            checklist: [
              {
                id: 'low-item',
                text: 'low item',
                state: 'unchecked',
                checked: false,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    }),
  });

  const { container } = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /^Tools/i }));
  const filterButton = screen.getByRole('button', { name: /filter/i });

  fireEvent.click(filterButton);
  fireEvent.click(
    screen.getByRole('menuitem', { name: /sort by priority high to front/i })
  );

  expect(container.querySelector('.front-card')).toHaveTextContent(
    'High priority project'
  );
});

test('priority five cards highlight the job name for attention', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'test-token',
      user: {
        name: 'Andrew',
        role: 'manager',
      },
      board: {
        todoColumns: [{ id: 'todo-1', title: 'To Do' }],
        cards: [
          {
            id: 'priority-five',
            taskName: 'Urgent project',
            jobName: 'Flashing client',
            lane: 'active',
            todoColumnId: 'todo-1',
            order: 1,
            priority: 5,
            createdAt: '2026-01-01T00:00:00.000Z',
            checklist: [
              {
                id: 'urgent-item',
                text: 'urgent item',
                state: 'unchecked',
                checked: false,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    }),
  });

  render(<App />);

  const jobName = await screen.findByText('Urgent project');
  const clientName = await screen.findByText('Flashing client');

  expect(jobName.closest('p')).toHaveClass('priority-alert-job');
  expect(clientName.closest('h3')).not.toHaveClass('priority-alert-job');
});

test('enter saves a focus mode project field without closing focus mode', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'test-token',
      user: {
        name: 'Andrew',
        role: 'manager',
      },
      board: {
        todoColumns: [{ id: 'todo-1', title: 'To Do' }],
        cards: [
          {
            id: 'focus-edit-card',
            taskName: 'Original project',
            jobName: 'Focus client',
            lane: 'active',
            todoColumnId: 'todo-1',
            order: 1,
            priority: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            checklist: [
              {
                id: 'focus-item',
                text: 'review brief',
                state: 'unchecked',
                checked: false,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    }),
  });

  render(<App />);

  const cardTitle = await screen.findByText('Original project');
  fireEvent.click(cardTitle.closest('article'));
  const focusModal = await screen.findByText(/focus mode/i);
  fireEvent.click(
    within(focusModal.closest('.focus-modal')).getByRole('button', {
      name: /original project/i,
    })
  );

  const projectInput = await screen.findByRole('textbox', { name: 'Project name' });
  act(() => projectInput.editor.commands.setContent(toEditorDocument('Updated project')));
  expect(screen.getByRole('button', { name: /^SAVE$/i })).toBeInTheDocument();

  fireEvent.keyDown(projectInput, { key: 'Enter', code: 'Enter' });

  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /^SAVE$/i })).not.toBeInTheDocument();
  });
  expect(screen.getByText(/focus mode/i)).toBeInTheDocument();
  expect(
    within(focusModal.closest('.focus-modal')).getByRole('button', {
      name: /updated project/i,
    })
  ).toBeInTheDocument();
});

test('focus mode completion phases archive prior checklist items', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'test-token',
      user: {
        name: 'Andrew',
        role: 'manager',
      },
      board: {
        todoColumns: [{ id: 'todo-1', title: 'To Do' }],
        cards: [
          {
            id: 'phase-card',
            taskName: 'Phase project',
            jobName: 'Phase client',
            lane: 'active',
            todoColumnId: 'todo-1',
            order: 1,
            priority: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            checklist: [
              {
                id: 'phase-item',
                text: 'phase one task',
                state: 'completed',
                checked: true,
                createdAt: '2026-05-01T00:00:00.000Z',
                completedAt: '2026-05-10T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    }),
  });

  render(<App />);

  const cardTitle = await screen.findByText('Phase project');
  fireEvent.click(cardTitle.closest('article'));
  const focusModal = await screen.findByText(/focus mode/i);
  const focusScope = within(focusModal.closest('.focus-modal'));

  fireEvent.click(focusScope.getByRole('button', { name: /completion options/i }));
  fireEvent.click(focusScope.getByRole('menuitem', { name: /add completion date/i }));
  fireEvent.change(screen.getByLabelText(/completion date/i), {
    target: { value: '2026-06-03' },
  });
  const phaseContext = await screen.findByRole('textbox', { name: 'Context note' });
  act(() => phaseContext.editor.commands.setContent(toEditorDocument('phase one complete')));
  fireEvent.click(focusScope.getByRole('button', { name: /save completion/i }));
  expect(screen.getByText(/archive current checklist/i)).toBeInTheDocument();
  expect(
    screen.getByText(/will be hidden under this completion phase/i)
  ).toBeInTheDocument();
  expect(focusScope.queryByRole('button', { name: /phase 1:/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /create completion/i }));

  const phaseButton = await focusScope.findByRole('button', { name: /phase 1:/i });
  expect(phaseButton).toHaveTextContent('2026/06/03');
  expect(focusScope.queryByRole('button', { name: /phase one task/i })).not.toBeInTheDocument();

  fireEvent.click(phaseButton);
  expect(focusScope.getByText('phase one task')).toBeInTheDocument();

  fireEvent.click(focusScope.getByRole('button', { name: /\+ add item/i }));
  const newChecklistInput = await screen.findByRole('textbox', { name: 'Checklist item' });
  act(() => newChecklistInput.editor.commands.setContent(toEditorDocument('phase two task')));
  fireEvent.keyDown(newChecklistInput, { key: 'Enter', code: 'Enter' });

  await waitFor(() => {
    expect(focusScope.getByRole('button', { name: /phase two task/i })).toBeInTheDocument();
  });
  const checklistText = focusModal.closest('.focus-modal').textContent;
  expect(checklistText.indexOf('phase two task')).toBeLessThan(
    checklistText.indexOf('phase 1:')
  );

  fireEvent.click(screen.getByRole('button', { name: /CLOSE/i }));
  expect(screen.queryByText(/phase 1:/i)).not.toBeInTheDocument();
});

test('header menus close on Escape and outside interaction', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /^Tools/i }));
  fireEvent.click(screen.getByRole('button', { name: /filter/i }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /andrew manager/i }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});


test('autosave does not repeat when the server returns a new revision', async () => {
  jest.useFakeTimers();
  const { unmount } = render(<App />);
  await screen.findByRole('button', { name: /SML Project Note/i });
  try {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ board: { updatedAt: 'revision-1' } }),
    });
    await act(async () => { jest.advanceTimersByTime(700); });
    const saves = () => global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
    expect(saves()).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(2100); });
    expect(saves()).toHaveLength(1);
  } finally {
    unmount();
    jest.useRealTimers();
  }
});

test('autosave waits for the previous request and uses its revision', async () => {
  jest.useFakeTimers();
  const { unmount } = render(<App />);
  await screen.findByRole('button', { name: /SML Project Note/i });
  try {
    let resolveSave;
    global.fetch.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    await act(async () => { jest.advanceTimersByTime(700); });
    act(() => { useBoardStore.getState().createCard({ taskName: 'Queued project', jobName: 'Client' }); });
    await act(async () => { jest.advanceTimersByTime(700); });
    const saves = () => global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
    expect(saves()).toHaveLength(1);
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ board: { updatedAt: 'revision-2' } }) });
    await act(async () => {
      resolveSave({ ok: true, json: async () => ({ board: { updatedAt: 'revision-1' } }) });
    });
    expect(saves()).toHaveLength(2);
    expect(JSON.parse(saves()[1][1].body).baseUpdatedAt).toBe('revision-1');
  } finally {
    unmount();
    jest.useRealTimers();
  }
});

test('first view keeps card details and secondary tools out of the board, with expandable status sections', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ user: { name: 'Andrew', role: 'manager' }, board: {
    todoColumns: [{ id: 'todo-1', title: 'To Do' }],
    cards: [
      { id: 'active-overview', taskName: 'Current project', jobName: 'Client', lane: 'active', todoColumnId: 'todo-1', priority: 5, checklist: [{ id: 'private-task', text: 'Detailed internal checklist', context: 'Detailed context' }] },
      { id: 'held-overview', taskName: 'Waiting project', jobName: 'Other client', lane: 'hold', todoColumnId: 'todo-1', checklist: [{ id: 'hold-task', text: 'Review response' }] },
    ],
  } }) });
  render(<App />);
  const title = await screen.findByText('Current project');
  expect(screen.queryByText('Detailed internal checklist')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Needs details/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /Paste update log/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Waiting project')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Show on hold cards/i }));
  expect(screen.getByText('Waiting project')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Hide on hold cards/i }));
  expect(screen.queryByText('Waiting project')).not.toBeInTheDocument();
  fireEvent.keyDown(title.closest('article'), { key: 'Enter' });
  expect(await screen.findByRole('dialog', { name: 'Card details' })).toHaveFocus();
  expect(screen.getByText('Detailed internal checklist')).toBeInTheDocument();
  expect(fireEvent.keyDown(screen.getByRole('button', { name: /\+ add item/i }), { key: 'Enter' })).toBe(true);
  expect(screen.getByRole('dialog', { name: 'Card details' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Card details' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Card details' })).not.toBeInTheDocument();
});
