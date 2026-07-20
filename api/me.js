const { getUsers, setUsers, getGroups } = require('../lib/db');
const { getAuthUser } = require('../lib/auth');

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }

    if (req.method === 'GET') {
      const users = await getUsers();
      const user = users[username];
      if (!user) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }

      const groups = await getGroups();
      let groupName = null;
      let isLeader = false;
      if (user.groupId && groups[user.groupId]) {
        groupName = groups[user.groupId].name;
        isLeader = groups[user.groupId].leaderUsername === username;
      }

      res.status(200).json({
        username,
        isAdmin: !!user.isAdmin,
        groupId: user.groupId || null,
        groupName,
        isLeader,
        hasAnyAdmin: Object.values(users).some(u => u.isAdmin)
      });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'bootstrap') {
        const users = await getUsers();
        const hasAdmin = Object.values(users).some(u => u.isAdmin);
        if (hasAdmin) { res.status(409).json({ error: '既に管理者が存在します' }); return; }
        users[username].isAdmin = true;
        await setUsers(users);
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: '不正なactionです' });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
