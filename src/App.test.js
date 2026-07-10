import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

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
  const filterButton = await screen.findByRole('button', { name: /filter/i });

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

  expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^logout$/i })).not.toBeInTheDocument();
});

test('settings can update account appearance preferences', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /andrew manager/i }));
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
  const filterButton = await screen.findByRole('button', { name: /filter/i });

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

  const projectInput = screen.getByDisplayValue('Original project');
  fireEvent.change(projectInput, { target: { value: 'Updated project' } });
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
  fireEvent.change(screen.getByPlaceholderText(/type phase context/i), {
    target: { value: 'phase one complete' },
  });
  fireEvent.click(focusScope.getByRole('button', { name: /save completion/i }));

  const phaseButton = await focusScope.findByRole('button', { name: /phase 1:/i });
  expect(phaseButton).toHaveTextContent('2026/06/03');
  expect(focusScope.queryByRole('button', { name: /phase one task/i })).not.toBeInTheDocument();

  fireEvent.click(phaseButton);
  expect(focusScope.getByText('phase one task')).toBeInTheDocument();

  fireEvent.click(focusScope.getByRole('button', { name: /\+ add item/i }));
  const newChecklistInput = screen.getByPlaceholderText(/checklist item/i);
  fireEvent.change(newChecklistInput, {
    target: { value: 'phase two task' },
  });
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
