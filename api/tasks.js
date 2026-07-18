const { getTasks, setTasks } = require('./_db');

function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const tasks = await getTasks();
      res.status(200).json(tasks);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.name || !body.dueAt || !body.priority) {
        res.status(400).json({ error: 'name, dueAt, priority は必須です' });
        return;
      }
      const tasks = await getTasks();
      const task = {
        id: uid(),
        name: body.name,
        detail: body.detail || '',
        dueAt: body.dueAt,
        priority: Number(body.priority),
        completed: false,
        alerted: false,
        snoozeUntil: null
      };
      tasks.push(task);
      await setTasks(tasks);
      res.status(201).json(task);
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (!body.id) {
        res.status(400).json({ error: 'id は必須です' });
        return;
      }
      const tasks = await getTasks();
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
      if (body.resetAlert) {
        task.alerted = false;
        task.snoozeUntil = null;
      }
      await setTasks(tasks);
      res.status(200).json(task);
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ error: 'id は必須です' });
        return;
      }
      const tasks = await getTasks();
      const next = tasks.filter(t => t.id !== id);
      await setTasks(next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
