const crypto = require('node:crypto');

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const hashPassword = (password) =>
  new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');

    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });

const verifyPassword = (password, storedHash) =>
  new Promise((resolve, reject) => {
    const [salt, key] = String(storedHash || '').split(':');

    if (!salt || !key) {
      resolve(false);
      return;
    }

    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(
        crypto.timingSafeEqual(
          Buffer.from(key, 'hex'),
          Buffer.from(derivedKey.toString('hex'), 'hex')
        )
      );
    });
  });

const encode = (value) => Buffer.from(value).toString('base64url');

const decode = (value) =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const createToken = (payload, secret) => {
  const body = encode(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
    })
  );
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
};

const verifyToken = (token, secret) => {
  const [body, signature] = String(token || '').split('.');

  if (!body || !signature) {
    const error = new Error('Missing token.');
    error.statusCode = 401;
    throw error;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) {
    const error = new Error('Invalid token.');
    error.statusCode = 401;
    throw error;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {
    const error = new Error('Invalid token.');
    error.statusCode = 401;
    throw error;
  }

  let payload;

  try {
    payload = decode(body);
  } catch (_error) {
    const error = new Error('Invalid token.');
    error.statusCode = 401;
    throw error;
  }

  if (payload.exp < Date.now()) {
    const error = new Error('Token expired.');
    error.statusCode = 401;
    throw error;
  }

  return payload;
};

module.exports = {
  createToken,
  hashPassword,
  normalizeEmail,
  verifyPassword,
  verifyToken,
};
