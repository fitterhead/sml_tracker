const cors = require('cors');
const express = require('express');
const { createAppService } = require('../backend/appService');
const { loadState, saveState } = require('./fileStore');

const app = express();
const port = process.env.PORT || 4000;
const secret = process.env.APP_AUTH_SECRET || 'local-dev-secret-change-me';

const service = createAppService({
  loadState,
  saveState,
  secret,
});

const readToken = (request) => {
  const header = request.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return '';
  }

  return header.slice('Bearer '.length);
};

const sendError = (response, error) => {
  response.status(error.statusCode || 500).json({
    error: error.message || 'Unexpected error.',
  });
};

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    mode: 'local-api',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/auth/register', async (request, response) => {
  try {
    const session = await service.register(request.body || {});
    response.status(201).json(session);
  } catch (error) {
    sendError(response, error);
  }
});

app.post('/api/auth/login', async (request, response) => {
  try {
    const session = await service.login(request.body || {});
    response.json(session);
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/auth/session', async (request, response) => {
  try {
    const session = await service.getSession(readToken(request));
    response.json(session);
  } catch (error) {
    sendError(response, error);
  }
});

app.put('/api/board', async (request, response) => {
  try {
    const board = await service.saveBoard(readToken(request), request.body?.cards);
    response.json(board);
  } catch (error) {
    sendError(response, error);
  }
});

app.listen(port, () => {
  console.log(`TrackerCard API running on http://localhost:${port}`);
});
