const webpush = require('web-push');
const { getUsers, getTasks, setTasks, getSubscriptions, setSubscriptions } = require('./_db');

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
    const users = await getUsers();
    const usernames = Object.keys(users);

    let totalChecked = 0;
    let totalNotified = 0;
    const debugErrors = [];

    for (const username of usernames) {
      const tasks = await getTasks(username);
      const subs = await getSubscriptions(username);
      totalChecked += tasks.length;

      const dueTasks = tasks.filter(t => {
        if (t.completed) return false;
        const effective = t.snoozeUntil ? new Date(t.snoozeUntil) : new Date(t.dueAt);
        return effective <= now && !t.alerted;
      });

      if (dueTasks.length === 0) continue;

      let validSubs = subs;
      const staleEndpoints = new Set();

      for (const task of dueTasks) {
        task.alerted = true;
        task.snoozeUntil = null;

        const dueDisplay = new Date(task.dueAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

        const payload = JSON.stringify({
          taskId: task.id,
          title: `${task.name}`,
          body: `期日：${dueDisplay}${task.detail ? '\n' + task.detail : ''}`,
          priority: task.priority
        });

        await Promise.all(
          validSubs.map(async sub => {
            try {
              await webpush.sendNotification(sub, payload);
            } catch (err) {
              debugErrors.push({ username, statusCode: err.statusCode, message: err.message });
              if (err.statusCode === 404 || err.statusCode === 410) {
                staleEndpoints.add(sub.endpoint);
              }
            }
          })
        );
      }

      if (staleEndpoints.size > 0) {
        validSubs = validSubs.filter(s => !staleEndpoints.has(s.endpoint));
        await setSubscriptions(username, validSubs);
      }

      await setTasks(username, tasks);
      totalNotified += dueTasks.length;
    }

    res.status(200).json({ users: usernames.length, checked: totalChecked, notified: totalNotified, debugErrors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
