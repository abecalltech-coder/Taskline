const { getUsers } = require('./_db');
const { getAuthUser } = require('./_auth');

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }
    const groupId = req.query.groupId;
    if (!groupId) { res.status(400).json({ error: 'groupId は必須です' }); return; }

    const users = await getUsers();
    const me = users[username];
    if (!me) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
    if (!me.isAdmin && me.groupId !== groupId) {
      res.status(403).json({ error: 'アクセス権がありません' });
      return;
    }

    const members = Object.keys(users).filter(name => users[name].groupId === groupId);
    res.status(200).json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
