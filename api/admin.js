const crypto = require('crypto');
const {
  getUsers, setUsers, getGroups, setGroups, getTasks, setTasks,
  getSubscriptions, setSubscriptions, getGroupTasks, setGroupTasks,
  getSessions, setSessions, deleteKey
} = require('../lib/db');
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

      if (body.action === 'renameUser') {
        const { oldUsername, newUsername } = body;
        if (!oldUsername || !newUsername) { res.status(400).json({ error: 'oldUsername, newUsername は必須です' }); return; }
        const cleanNew = String(newUsername).trim().toLowerCase();
        if (!/^[a-z0-9_\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFFー]{3,20}$/u.test(cleanNew)) {
          res.status(400).json({ error: '新しいユーザーIDの形式が正しくありません（半角英数字・ひらがな・カタカナ・漢字・-・_、3〜20文字）' });
          return;
        }
        if (!users[oldUsername]) { res.status(404).json({ error: '対象ユーザーが見つかりません' }); return; }
        if (cleanNew !== oldUsername && users[cleanNew]) { res.status(409).json({ error: 'そのユーザーIDは既に使われています' }); return; }

        if (cleanNew === oldUsername) { res.status(200).json({ ok: true }); return; }

        const userRecord = users[oldUsername];
        users[cleanNew] = userRecord;
        delete users[oldUsername];
        await setUsers(users);

        const tasks = await getTasks(oldUsername);
        await setTasks(cleanNew, tasks);
        await deleteKey(`tasks:${oldUsername}`);

        const subs = await getSubscriptions(oldUsername);
        await setSubscriptions(cleanNew, subs);
        await deleteKey(`subscriptions:${oldUsername}`);

        let groupsChanged = false;
        for (const g of Object.values(groups)) {
          if (g.leaderUsername === oldUsername) { g.leaderUsername = cleanNew; groupsChanged = true; }
        }
        if (groupsChanged) await setGroups(groups);

        for (const groupId of Object.keys(groups)) {
          const gTasks = await getGroupTasks(groupId);
          let changed = false;
          for (const t of gTasks) {
            if (t.createdBy === oldUsername) { t.createdBy = cleanNew; changed = true; }
            if (Array.isArray(t.assignedTo) && t.assignedTo.includes(oldUsername)) {
              t.assignedTo = t.assignedTo.map(n => (n === oldUsername ? cleanNew : n));
              changed = true;
            }
          }
          if (changed) await setGroupTasks(groupId, gTasks);
        }

        for (const uname of Object.keys(users)) {
          const uTasks = await getTasks(uname);
          let changed = false;
          for (const t of uTasks) {
            if (t.assignedBy === oldUsername) { t.assignedBy = cleanNew; changed = true; }
          }
          if (changed) await setTasks(uname, uTasks);
        }

        const sessions = await getSessions();
        let sessionsChanged = false;
        for (const [token, uname] of Object.entries(sessions)) {
          if (uname === oldUsername) { delete sessions[token]; sessionsChanged = true; }
        }
        if (sessionsChanged) await setSessions(sessions);

        res.status(200).json({ ok: true, newUsername: cleanNew });
        return;
      }

      if (body.action === 'deleteUser') {
        const targetUsername = body.username;
        if (!targetUsername) { res.status(400).json({ error: 'username は必須です' }); return; }
        if (!users[targetUsername]) { res.status(404).json({ error: '対象ユーザーが見つかりません' }); return; }
        if (targetUsername === admin) { res.status(400).json({ error: '自分自身は削除できません' }); return; }

        delete users[targetUsername];
        await setUsers(users);

        await deleteKey(`tasks:${targetUsername}`);
        await deleteKey(`subscriptions:${targetUsername}`);

        let groupsChanged = false;
        for (const g of Object.values(groups)) {
          if (g.leaderUsername === targetUsername) { g.leaderUsername = null; groupsChanged = true; }
        }
        if (groupsChanged) await setGroups(groups);

        for (const groupId of Object.keys(groups)) {
          const gTasks = await getGroupTasks(groupId);
          let changed = false;
          for (const t of gTasks) {
            if (Array.isArray(t.assignedTo) && t.assignedTo.includes(targetUsername)) {
              t.assignedTo = t.assignedTo.filter(n => n !== targetUsername);
              changed = true;
            }
          }
          if (changed) await setGroupTasks(groupId, gTasks);
        }

        const sessions = await getSessions();
        let sessionsChanged = false;
        for (const [token, uname] of Object.entries(sessions)) {
          if (uname === targetUsername) { delete sessions[token]; sessionsChanged = true; }
        }
        if (sessionsChanged) await setSessions(sessions);

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
