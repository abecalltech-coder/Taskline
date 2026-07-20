const { getUsers, getGroups } = require('./_db');
const { getAuthUser } = require('./_auth');

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
