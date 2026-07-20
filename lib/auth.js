const { getSessions } = require('./db');

async function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const sessions = await getSessions();
  return sessions[token] || null;
}

module.exports = { getAuthUser };
