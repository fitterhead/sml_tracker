const API_BASE = (process.env.REACT_APP_API_BASE || '/api').replace(/\/$/, '');

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token
        ? { Authorization: `Bearer ${options.token}` }
        : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
};

export const loginRequest = (credentials) =>
  request('/auth/login', {
    method: 'POST',
    body: credentials,
  });

export const registerRequest = (profile) =>
  request('/auth/register', {
    method: 'POST',
    body: profile,
  });

export const fetchSession = (token) =>
  request('/auth/session', {
    token,
  });

export const saveBoardRequest = (token, board, baseUpdatedAt = '') =>
  request('/board', {
    method: 'PUT',
    token,
    body: {
      ...(Array.isArray(board) ? { cards: board } : { board }),
      baseUpdatedAt,
    },
  });
