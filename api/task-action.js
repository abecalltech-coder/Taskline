const { getUsers, getTasks, setTasks } = require('./_db');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    const { taskId, action } = req.body || {};
    if (!taskId || !action) {
      res.status(400).json({ error: 'taskId, action は必須です' });
      return;
    }

    const users = await getUsers();
    const usernames = Object.keys(users);

    for (const username of usernames) {
      const tasks = await getTasks(username);
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;

      if (action === 'snooze') {
        task.snoozeUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        task.alerted = false;
      } else if (action === 'complete') {
        task.completed = true;
      }
      await setTasks(username, tasks);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(404).json({ error: 'タスクが見つかりません' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
