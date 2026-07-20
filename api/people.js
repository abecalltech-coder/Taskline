const { getUsers, getGroups } = require('../lib/db');
const { getAuthUser } = require('../lib/auth');

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }

    const type = req.query.type;
    const users = await getUsers();
    const me = users[username];
    if (!me) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }

    if (type === 'group-members') {
      const groupId = req.query.groupId;
      if (!groupId) { res.status(400).json({ error: 'groupId は必須です' }); return; }
      if (!me.isAdmin && me.groupId !== groupId) { res.status(403).json({ error: 'アクセス権がありません' }); return; }
      const members = Object.keys(users).filter(name => users[name].groupId === groupId);
      res.status(200).json({ members });
      return;
    }

    if (type === 'assignable') {
      if (me.isAdmin) {
        res.status(200).json({ scope: 'all', usernames: Object.keys(users).filter(n => n !== username) });
        return;
      }
      if (me.groupId) {
        const groups = await getGroups();
        const group = groups[me.groupId];
        if (group && group.leaderUsername === username) {
          const members = Object.entries(users)
            .filter(([name, u]) => u.groupId === me.groupId && name !== username)
            .map(([name]) => name);
          res.status(200).json({ scope: 'group', usernames: members });
          return;
        }
      }
      res.status(200).json({ scope: 'none', usernames: [] });
      return;
    }

    res.status(400).json({ error: '不正なtypeです' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
