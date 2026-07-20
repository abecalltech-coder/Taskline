const { getSessions, getUsers } = require('./db');

async function getAdminUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const sessions = await getSessions();
  const username = sessions[token];
  if (!username) return null;
  const users = await getUsers();
  const user = users[username];
  if (!user || !user.isAdmin) return null;
  return username;
}

module.exports = { getAdminUser };
