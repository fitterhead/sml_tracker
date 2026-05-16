const loadEnv = () => {
  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  try {
    process.loadEnvFile();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

module.exports = {
  loadEnv,
};
