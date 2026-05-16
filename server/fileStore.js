const fs = require('node:fs/promises');
const path = require('node:path');
const { createInitialState } = require('../backend/defaults');

const dataDirectory = process.env.DATA_DIR || path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'app-state.json');

const ensureDataFile = async () => {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch (_error) {
    await fs.writeFile(
      dataFile,
      JSON.stringify(createInitialState(), null, 2),
      'utf8'
    );
  }
};

const loadState = async () => {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw);
};

const saveState = async (state) => {
  await ensureDataFile();
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8');
};

module.exports = {
  loadState,
  saveState,
};
