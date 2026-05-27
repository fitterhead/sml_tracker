const { getStore } = require('@netlify/blobs');

const DEFAULT_STORE_NAME = 'sml-tracker';
const DEFAULT_STATE_KEY = 'app-state';

const hasNetlifyBlobRuntimeContext = () =>
  Boolean(globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT);

const getManualBlobConfig = () => {
  if (hasNetlifyBlobRuntimeContext()) {
    return undefined;
  }

  if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_ACCESS_TOKEN) {
    return undefined;
  }

  return {
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_ACCESS_TOKEN,
  };
};

const createBlobStateStore = ({
  storeName = process.env.NETLIFY_BLOBS_STORE_NAME || DEFAULT_STORE_NAME,
  stateKey = process.env.NETLIFY_BLOBS_STATE_KEY || DEFAULT_STATE_KEY,
  config,
} = {}) => {
  const getBlobStore = () => getStore(storeName, config || getManualBlobConfig());

  return {
    async loadState() {
      const store = getBlobStore();
      return store.get(stateKey, { type: 'json' });
    },
    async saveState(state) {
      const store = getBlobStore();
      await store.setJSON(stateKey, state);
    },
  };
};

const shouldUseBlobStore = () =>
  process.env.NETLIFY_BLOBS_ENABLED === 'true' ||
  Boolean(process.env.NETLIFY_SITE_ID && process.env.NETLIFY_ACCESS_TOKEN);

module.exports = {
  createBlobStateStore,
  shouldUseBlobStore,
};
