const { getUsers, setUsers } = require('./_db');
const { getAuthUser } = require('./_auth');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }

    const users = await getUsers();
    const hasAdmin = Object.values(users).some(u => u.isAdmin);
    if (hasAdmin) {
      res.status(409).json({ error: '既に管理者が存在します' });
      return;
    }
    users[username].isAdmin = true;
    await setUsers(users);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
