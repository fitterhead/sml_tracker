const cors = require('cors');
const express = require('express');

const app = express();
const port = process.env.PORT || 4000;

const users = [
  { id: 'manager-1', name: 'Duy Nguyen', role: 'manager' },
  { id: 'staff-1', name: 'Minh Tran', role: 'staff' },
  { id: 'staff-2', name: 'Linh Pham', role: 'staff' },
];

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: 'local-mock',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/users', (_req, res) => {
  res.json(users);
});

app.get('/api/bootstrap', (_req, res) => {
  res.json({
    appName: 'NoteBoard',
    users,
    roles: ['manager', 'staff'],
    storage: 'localStorage',
  });
});

app.listen(port, () => {
  console.log(`TrackerCard API running on http://localhost:${port}`);
});
