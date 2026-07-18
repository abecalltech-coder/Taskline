const webpush = require('web-push');
const { getTasks, setTasks, getSubscriptions, setSubscriptions } = require('./_db');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:example@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers['authorization'] || '';
  if (auth === `Bearer ${secret}`) return true;
  if (req.query && req.query.secret === secret) return true;
  return false;
}

module.exports = async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const now = new Date();
    const tasks = await getTasks();
    const subs = await getSubscriptions();

    const dueTasks = tasks.filter(t => {
      if (t.completed) return false;
      const effective = t.snoozeUntil ? new Date(t.snoozeUntil) : new Date(t.dueAt);
      return effective <= now && !t.alerted;
    });

    if (dueTasks.length === 0) {
      res.status(200).json({ checked: tasks.length, notified: 0 });
      return;
    }

    let validSubs = subs;
    const staleEndpoints = new Set();

    for (const task of dueTasks) {
      task.alerted = true;
      task.snoozeUntil = null;

      const payload = JSON.stringify({
        taskId: task.id,
        title: `${task.name}`,
        body: `期日：${new Date(task.dueAt).toLocaleString('ja-JP')}${task.detail ? '\n' + task.detail : ''}`,
        priority: task.priority
      });

      await Promise.all(
        validSubs.map(async sub => {
          try {
            await webpush.sendNotification(sub, payload);
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              staleEndpoints.add(sub.endpoint);
            }
          }
        })
      );
    }

    if (staleEndpoints.size > 0) {
      validSubs = validSubs.filter(s => !staleEndpoints.has(s.endpoint));
      await setSubscriptions(validSubs);
    }

    await setTasks(tasks);

    res.status(200).json({ checked: tasks.length, notified: dueTasks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
