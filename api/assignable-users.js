const { getUsers, getGroups } = require('./_db');
const { getAuthUser } = require('./_auth');

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }

    const users = await getUsers();
    const me = users[username];
    if (!me) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
