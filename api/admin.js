const crypto = require('crypto');
const { getUsers, setUsers, getGroups, setGroups, getTasks } = require('../lib/db');
const { getAdminUser } = require('../lib/admin');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function uid() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = async (req, res) => {
  try {
    const admin = await getAdminUser(req);
    if (!admin) { res.status(403).json({ error: '管理者権限が必要です' }); return; }

    if (req.method === 'GET') {
      const users = await getUsers();
      const groups = await getGroups();
      const safeUsers = {};
      for (const [name, u] of Object.entries(users)) {
        safeUsers[name] = {
          isAdmin: !!u.isAdmin,
          groupId: u.groupId || null,
          createdAt: u.createdAt || null
        };
      }
      res.status(200).json({ users: safeUsers, groups });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const users = await getUsers();
      const groups = await getGroups();

      if (body.action === 'createGroup') {
        if (!body.name) { res.status(400).json({ error: 'グループ名は必須です' }); return; }
        const groupId = uid();
        groups[groupId] = { name: body.name, leaderUsername: null, createdAt: new Date().toISOString() };
        await setGroups(groups);
        res.status(201).json({ groupId, group: groups[groupId] });
        return;
      }

      if (body.action === 'renameGroup') {
        if (!body.groupId || !groups[body.groupId]) { res.status(404).json({ error: 'グループが見つかりません' }); return; }
        groups[body.groupId].name = body.name || groups[body.groupId].name;
        await setGroups(groups);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'deleteGroup') {
        if (!body.groupId || !groups[body.groupId]) { res.status(404).json({ error: 'グループが見つかりません' }); return; }
        delete groups[body.groupId];
        await setGroups(groups);
        for (const u of Object.values(users)) {
          if (u.groupId === body.groupId) u.groupId = null;
        }
        await setUsers(users);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'assignGroup') {
        if (!body.username || !users[body.username]) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
        if (body.groupId && !groups[body.groupId]) { res.status(404).json({ error: 'グループが見つかりません' }); return; }
        users[body.username].groupId = body.groupId || null;
        await setUsers(users);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'setLeader') {
        if (!body.groupId || !groups[body.groupId]) { res.status(404).json({ error: 'グループが見つかりません' }); return; }
        if (body.username && (!users[body.username] || users[body.username].groupId !== body.groupId)) {
          res.status(400).json({ error: '指定したユーザーはこのグループに所属していません' });
          return;
        }
        groups[body.groupId].leaderUsername = body.username || null;
        await setGroups(groups);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'resetPassword') {
        if (!body.username || !users[body.username]) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
        if (!body.newPassword || String(body.newPassword).length < 4) { res.status(400).json({ error: 'パスワードは4文字以上にしてください' }); return; }
        const salt = crypto.randomBytes(16).toString('hex');
        users[body.username].salt = salt;
        users[body.username].passwordHash = hashPassword(body.newPassword, salt);
        await setUsers(users);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'setAdmin') {
        if (!body.username || !users[body.username]) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
        users[body.username].isAdmin = !!body.isAdmin;
        await setUsers(users);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'getUserTasks') {
        if (!body.username) { res.status(400).json({ error: 'username は必須です' }); return; }
        const tasks = await getTasks(body.username);
        res.status(200).json({ tasks });
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
