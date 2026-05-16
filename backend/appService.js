const { randomUUID } = require('node:crypto');
const { createInitialState, normalizeBoard, normalizeState } = require('./defaults');
const {
  createToken,
  hashPassword,
  normalizeEmail,
  verifyPassword,
  verifyToken,
} = require('./auth');

const VALID_ROLES = new Set(['manager', 'staff']);

const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

const assert = (condition, message, statusCode = 400) => {
  if (!condition) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  }
};

const buildSession = (user, state, secret) => ({
  token: createToken({ userId: user.id }, secret),
  user: toPublicUser(user),
  board: state.board,
});

const createAppService = ({ loadState, saveState, secret }) => {
  const readState = async () => {
    const state = await loadState();

    if (!state) {
      const initialState = createInitialState();
      await saveState(initialState);
      return initialState;
    }

    return normalizeState(state);
  };

  const getUserFromToken = async (token) => {
    const payload = verifyToken(token, secret);
    const state = await readState();
    const user = state.users.find((entry) => entry.id === payload.userId);

    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 401;
      throw error;
    }

    return { state, user };
  };

  return {
    async register({ name, email, password, role }) {
      assert(name?.trim(), 'Name is required.');
      assert(email?.trim(), 'Email is required.');
      assert(password?.trim(), 'Password is required.');
      assert(password.trim().length >= 8, 'Password must be at least 8 characters.');
      assert(VALID_ROLES.has(role), 'Role must be manager or staff.');

      const state = await readState();
      const normalizedEmail = normalizeEmail(email);
      const existingUser = state.users.find(
        (entry) => entry.email === normalizedEmail
      );

      assert(!existingUser, 'That email is already registered.', 409);

      const passwordHash = await hashPassword(password.trim());
      const nextUser = {
        id: randomUUID(),
        name: name.trim(),
        email: normalizedEmail,
        role,
        passwordHash,
        createdAt: new Date().toISOString(),
      };

      state.users.push(nextUser);
      await saveState(state);

      return buildSession(nextUser, state, secret);
    },
    async login({ email, password }) {
      assert(email?.trim(), 'Email is required.');
      assert(password?.trim(), 'Password is required.');

      const state = await readState();
      const normalizedEmail = normalizeEmail(email);
      const user = state.users.find((entry) => entry.email === normalizedEmail);

      assert(user, 'Email or password is incorrect.', 401);

      const validPassword = await verifyPassword(password.trim(), user.passwordHash);
      assert(validPassword, 'Email or password is incorrect.', 401);

      return buildSession(user, state, secret);
    },
    async getSession(token) {
      const { state, user } = await getUserFromToken(token);

      return buildSession(user, state, secret);
    },
    async saveBoard(token, boardPayload) {
      const incomingBoard = Array.isArray(boardPayload)
        ? { cards: boardPayload }
        : boardPayload;

      assert(
        incomingBoard && Array.isArray(incomingBoard.cards),
        'Board payload is invalid.'
      );

      const { state } = await getUserFromToken(token);
      state.board = normalizeBoard({
        ...state.board,
        ...incomingBoard,
        updatedAt: new Date().toISOString(),
      });
      await saveState(state);

      return state.board;
    },
  };
};

module.exports = {
  createAppService,
};
