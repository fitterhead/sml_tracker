import { fireEvent, render, screen } from '@testing-library/react';
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

  const jobName = await screen.findByText('Flashing client');
  expect(jobName.closest('h3')).toHaveClass('priority-alert-title');
});
