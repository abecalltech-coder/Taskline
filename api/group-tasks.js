const webpush = require('web-push');
const { getUsers, getGroups, getGroupTasks, setGroupTasks, getSubscriptions } = require('./_db');
const { getAuthUser } = require('./_auth');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:example@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function uid() {
  return 'gt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function checkMembership(username, groupId) {
  const users = await getUsers();
  const user = users[username];
  if (!user) return false;
  if (user.isAdmin) return true;
  return user.groupId === groupId;
}

async function isGroupLeaderOrAdmin(username, groupId) {
  const users = await getUsers();
  const user = users[username];
  if (!user) return false;
  if (user.isAdmin) return true;
  const groups = await getGroups();
  return !!(groups[groupId] && groups[groupId].leaderUsername === username);
}

async function sendUrgentPush(groupId, task, fromUsername) {
  const users = await getUsers();
  const memberUsernames = Object.entries(users)
    .filter(([, u]) => u.groupId === groupId)
    .map(([name]) => name);

  const payload = JSON.stringify({
    taskId: task.id,
    title: `🔥【至急】${task.name}`,
    body: `${fromUsername}さんからの至急連絡：${task.detail || '至急対応してください'}`,
    priority: 5
  });

  for (const memberUsername of memberUsernames) {
    const subs = await getSubscriptions(memberUsername);
    await Promise.all(subs.map(sub => webpush.sendNotification(sub, payload).catch(() => {})));
  }
}

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }

    if (req.method === 'GET') {
      const groupId = req.query.groupId;
      if (!groupId) { res.status(400).json({ error: 'groupId は必須です' }); return; }
      const allowed = await checkMembership(username, groupId);
      if (!allowed) { res.status(403).json({ error: 'このグループへのアクセス権がありません' }); return; }
      const tasks = await getGroupTasks(groupId);
      res.status(200).json(tasks);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.groupId || !body.name || !body.dueAt || !body.priority) {
        res.status(400).json({ error: 'groupId, name, dueAt, priority は必須です' });
        return;
      }
      const allowed = await checkMembership(username, body.groupId);
      if (!allowed) { res.status(403).json({ error: 'このグループへのアクセス権がありません' }); return; }

      const tasks = await getGroupTasks(body.groupId);
      const task = {
        id: uid(),
        name: body.name,
        detail: body.detail || '',
        dueAt: body.dueAt,
        priority: Number(body.priority),
        completed: false,
        alerted: false,
        snoozeUntil: null,
        createdBy: username
      };
      tasks.push(task);
      await setGroupTasks(body.groupId, tasks);

      if (body.sendUrgent) {
        const canUrgent = await isGroupLeaderOrAdmin(username, body.groupId);
        if (canUrgent) {
          await sendUrgentPush(body.groupId, task, username);
        }
      }

      res.status(201).json(task);
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (!body.groupId || !body.id) { res.status(400).json({ error: 'groupId, id は必須です' }); return; }
      const allowed = await checkMembership(username, body.groupId);
      if (!allowed) { res.status(403).json({ error: 'このグループへのアクセス権がありません' }); return; }

      const tasks = await getGroupTasks(body.groupId);
      const task = tasks.find(t => t.id === body.id);
      if (!task) { res.status(404).json({ error: 'タスクが見つかりません' }); return; }

      if (body.name !== undefined) task.name = body.name;
      if (body.detail !== undefined) task.detail = body.detail;
      if (body.dueAt !== undefined) task.dueAt = body.dueAt;
      if (body.priority !== undefined) task.priority = Number(body.priority);
      if (body.completed !== undefined) task.completed = !!body.completed;
      if (body.snoozeUntil !== undefined) task.snoozeUntil = body.snoozeUntil;
      if (body.resetAlert) { task.alerted = false; task.snoozeUntil = null; }
      await setGroupTasks(body.groupId, tasks);

      if (body.sendUrgent) {
        const canUrgent = await isGroupLeaderOrAdmin(username, body.groupId);
        if (!canUrgent) { res.status(403).json({ error: '責任者または管理者のみ至急通知を送れます' }); return; }
        await sendUrgentPush(body.groupId, task, username);
      }

      res.status(200).json(task);
      return;
    }

    if (req.method === 'DELETE') {
      const groupId = req.query.groupId;
      const id = req.query.id;
      if (!groupId || !id) { res.status(400).json({ error: 'groupId, id は必須です' }); return; }
      const allowed = await checkMembership(username, groupId);
      if (!allowed) { res.status(403).json({ error: 'このグループへのアクセス権がありません' }); return; }

      const tasks = await getGroupTasks(groupId);
      const next = tasks.filter(t => t.id !== id);
      await setGroupTasks(groupId, next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
