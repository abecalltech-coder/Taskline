const { getUsers, getGroups, getTasks, setTasks } = require('./_db');
const { getAuthUser } = require('./_auth');

function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
    const username = await getAuthUser(req);
    if (!username) { res.status(401).json({ error: 'ログインが必要です' }); return; }

    const body = req.body || {};
    const { targetUsername, name, detail, dueAt, priority } = body;
    if (!targetUsername || !name || !dueAt || !priority) {
      res.status(400).json({ error: 'targetUsername, name, dueAt, priority は必須です' });
      return;
    }

    const users = await getUsers();
    const me = users[username];
    const target = users[targetUsername];
    if (!me || !target) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }

    let allowed = false;
    if (me.isAdmin) {
      allowed = true;
    } else if (me.groupId) {
      const groups = await getGroups();
      const group = groups[me.groupId];
      if (group && group.leaderUsername === username && target.groupId === me.groupId) {
        allowed = true;
      }
    }
    if (!allowed) {
      res.status(403).json({ error: 'このユーザーにタスクを割り当てる権限がありません' });
      return;
    }

    const tasks = await getTasks(targetUsername);
    const task = {
      id: uid(),
      name,
      detail: detail || '',
      dueAt,
      priority: Number(priority),
      completed: false,
      alerted: false,
      snoozeUntil: null,
      assignedBy: username
    };
    tasks.push(task);
    await setTasks(targetUsername, tasks);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
