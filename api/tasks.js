const { getTasks, setTasks } = require('../lib/db');
const { getAuthUser } = require('../lib/auth');

function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) {
      res.status(401).json({ error: 'ログインが必要です' });
      return;
    }

    if (req.method === 'GET') {
      const tasks = await getTasks(username);
      res.status(200).json(tasks);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.name || !body.dueAt || !body.priority) {
        res.status(400).json({ error: 'name, dueAt, priority は必須です' });
        return;
      }
      const tasks = await getTasks(username);
      const task = {
        id: uid(),
        name: body.name,
        detail: body.detail || '',
        dueAt: body.dueAt,
        priority: Number(body.priority),
        completed: false,
        alerted: false,
        snoozeUntil: null,
        remindBefore: body.remindBefore ? Number(body.remindBefore) : null,
        remindAlerted: false
      };
      tasks.push(task);
      await setTasks(username, tasks);
      res.status(201).json(task);
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (!body.id) {
        res.status(400).json({ error: 'id は必須です' });
        return;
      }
      const tasks = await getTasks(username);
      const task = tasks.find(t => t.id === body.id);
      if (!task) {
        res.status(404).json({ error: 'タスクが見つかりません' });
        return;
      }
      if (body.name !== undefined) task.name = body.name;
      if (body.detail !== undefined) task.detail = body.detail;
      if (body.dueAt !== undefined) task.dueAt = body.dueAt;
      if (body.priority !== undefined) task.priority = Number(body.priority);
      if (body.completed !== undefined) task.completed = !!body.completed;
      if (body.snoozeUntil !== undefined) task.snoozeUntil = body.snoozeUntil;
      if (body.remindBefore !== undefined) {
        task.remindBefore = body.remindBefore ? Number(body.remindBefore) : null;
        task.remindAlerted = false;
      }
      if (body.resetAlert) {
        task.alerted = false;
        task.snoozeUntil = null;
        task.remindAlerted = false;
      }
      await setTasks(username, tasks);
      res.status(200).json(task);
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ error: 'id は必須です' });
        return;
      }
      const tasks = await getTasks(username);
      const next = tasks.filter(t => t.id !== id);
      await setTasks(username, next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
