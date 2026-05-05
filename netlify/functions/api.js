const { getStore } = require('@netlify/blobs');
const { createAppService } = require('../../backend/appService');

const secret = process.env.APP_AUTH_SECRET || process.env.NETLIFY_AUTH_SECRET;

const service = createAppService({
  loadState: async () => {
    const store = getStore('sml-tracker');
    const state = await store.get('app-state', { type: 'json' });
    return state;
  },
  saveState: async (state) => {
    const store = getStore('sml-tracker');
    await store.set('app-state', JSON.stringify(state));
  },
  secret: secret || 'netlify-dev-secret-change-me',
});

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch (_error) {
    return {};
  }
};

const readToken = (headers = {}) => {
  const header = headers.authorization || headers.Authorization || '';

  if (!header.startsWith('Bearer ')) {
    return '';
  }

  return header.slice('Bearer '.length);
};

const getApiPath = (eventPath = '') => {
  if (eventPath.startsWith('/api/')) {
    return eventPath;
  }

  const marker = '/.netlify/functions/api';
  const index = eventPath.indexOf(marker);

  if (index >= 0) {
    const suffix = eventPath.slice(index + marker.length) || '/';
    return suffix.startsWith('/api/') ? suffix : `/api${suffix}`;
  }

  return eventPath || '/';
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        Allow: 'GET,POST,PUT,OPTIONS',
      },
    };
  }

  const path = getApiPath(event.path);

  try {
    if (event.httpMethod === 'GET' && path === '/api/health') {
      return json(200, {
        status: 'ok',
        mode: 'netlify-function',
        timestamp: new Date().toISOString(),
      });
    }

    if (event.httpMethod === 'POST' && path === '/api/auth/register') {
      const session = await service.register(parseBody(event.body));
      return json(201, session);
    }

    if (event.httpMethod === 'POST' && path === '/api/auth/login') {
      const session = await service.login(parseBody(event.body));
      return json(200, session);
    }

    if (event.httpMethod === 'GET' && path === '/api/auth/session') {
      const session = await service.getSession(readToken(event.headers));
      return json(200, session);
    }

    if (event.httpMethod === 'PUT' && path === '/api/board') {
      const board = await service.saveBoard(
        readToken(event.headers),
        parseBody(event.body).cards
      );
      return json(200, board);
    }

    return json(404, { error: 'Not found.' });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || 'Unexpected error.',
    });
  }
};
