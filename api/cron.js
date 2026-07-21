const webpush = require('web-push');
const {
  getUsers, getTasks, setTasks, getSubscriptions, setSubscriptions,
  getGroups, getGroupTasks, setGroupTasks
} = require('../lib/db');

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

function dueDisplay(dueAt) {
  return new Date(dueAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function remindLabel(minutes) {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)}日前`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}時間前`;
  return `${minutes}分前`;
}

async function pushToUsernames(usernames, payload, debugErrors) {
  for (const username of usernames) {
    const subs = await getSubscriptions(username);
    await Promise.all(
      subs.map(sub =>
        webpush.sendNotification(sub, payload).catch(err => {
          debugErrors.push({ username, statusCode: err.statusCode, message: err.message });
        })
      )
    );
  }
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function nthWeekdayOfMonth(year, month, weekday, n) {
  if (n === -1) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    last.setDate(last.getDate() - diff);
    return last;
  }
  const first = new Date(year, month, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  const date = 1 + diff + (n - 1) * 7;
  return new Date(year, month, date);
}

function computeNextOccurrence(recurrence, fromDate) {
  const base = new Date(fromDate);
  let next;
  if (recurrence.freq === 'daily') {
    next = new Date(base);
    next.setDate(next.getDate() + 1);
  } else if (recurrence.freq === 'weekly') {
    const days = (recurrence.daysOfWeek && recurrence.daysOfWeek.length)
      ? [...recurrence.daysOfWeek].sort((a, b) => a - b)
      : [base.getDay()];
    next = null;
    for (let i = 1; i <= 14; i++) {
      const cand = new Date(base);
      cand.setDate(cand.getDate() + i);
      if (days.includes(cand.getDay())) { next = cand; break; }
    }
    if (!next) return null;
  } else if (recurrence.freq === 'monthly-date') {
    next = new Date(base);
    next.setMonth(next.getMonth() + 1);
    const day = recurrence.dayOfMonth || base.getDate();
    next.setDate(Math.min(day, daysInMonth(next.getFullYear(), next.getMonth())));
  } else if (recurrence.freq === 'monthly-weekday') {
    const target = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    next = nthWeekdayOfMonth(target.getFullYear(), target.getMonth(), recurrence.weekday, recurrence.weekOfMonth);
  } else {
    return null;
  }
  next.setHours(base.getHours(), base.getMinutes(), 0, 0);
  return next;
}

function advanceRecurrence(task, now) {
  let nextDue = computeNextOccurrence(task.recurrence, new Date(task.dueAt));
  let guard = 0;
  while (nextDue && nextDue <= now && guard < 60) {
    nextDue = computeNextOccurrence(task.recurrence, nextDue);
    guard++;
  }
  if (!nextDue) return false;
  task.dueAt = nextDue.toISOString();
  task.alerted = false;
  task.remindAlerted = false;
  task.completed = false;
  task.snoozeUntil = null;
  return true;
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

    /* ---- 個人タスク ---- */
    for (const username of usernames) {
      const tasks = await getTasks(username);
      totalChecked += tasks.length;
      let changed = false;

      for (const task of tasks) {
        const isRecurring = !!task.recurrence;
        if (!isRecurring && task.completed) continue;

        const due = new Date(task.dueAt);
        const effective = task.snoozeUntil ? new Date(task.snoozeUntil) : due;

        if (effective <= now && !task.alerted) {
          task.alerted = true;
          task.snoozeUntil = null;
          changed = true;
          const payload = JSON.stringify({
            taskId: task.id,
            title: `${task.name}`,
            body: `期日：${dueDisplay(task.dueAt)}${task.detail ? '\n' + task.detail : ''}`,
            priority: task.priority
          });
          await pushToUsernames([username], payload, debugErrors);
          totalNotified++;
        }

        if (task.remindBefore && !task.remindAlerted && !task.alerted) {
          const remindTime = new Date(due.getTime() - task.remindBefore * 60000);
          if (remindTime <= now && due > now) {
            task.remindAlerted = true;
            changed = true;
            const payload = JSON.stringify({
              taskId: task.id,
              title: `⏰ 事前通知：${task.name}`,
              body: `${remindLabel(task.remindBefore)}です。期日：${dueDisplay(task.dueAt)}${task.detail ? '\n' + task.detail : ''}`,
              priority: task.priority
            });
            await pushToUsernames([username], payload, debugErrors);
            totalNotified++;
          }
        }

        if (isRecurring && due <= now) {
          if (advanceRecurrence(task, now)) changed = true;
        }
      }

      if (changed) await setTasks(username, tasks);
    }

    /* ---- グループタスク ---- */
    const groups = await getGroups();
    for (const [groupId, group] of Object.entries(groups)) {
      const tasks = await getGroupTasks(groupId);
      totalChecked += tasks.length;
      let changed = false;

      const allMemberUsernames = Object.entries(users)
        .filter(([, u]) => u.groupId === groupId)
        .map(([name]) => name);

      for (const task of tasks) {
        const isRecurring = !!task.recurrence;
        if (!isRecurring && task.completed) continue;

        const due = new Date(task.dueAt);
        const targetUsernames = (task.assignedTo && task.assignedTo.length) ? task.assignedTo : allMemberUsernames;
        const effective = task.snoozeUntil ? new Date(task.snoozeUntil) : due;

        if (effective <= now && !task.alerted) {
          task.alerted = true;
          task.snoozeUntil = null;
          changed = true;
          const payload = JSON.stringify({
            taskId: task.id,
            title: `👥[${group.name}] ${task.name}`,
            body: `期日：${dueDisplay(task.dueAt)}${task.detail ? '\n' + task.detail : ''}`,
            priority: task.priority
          });
          await pushToUsernames(targetUsernames, payload, debugErrors);
          totalNotified++;
        }

        if (task.remindBefore && !task.remindAlerted && !task.alerted) {
          const remindTime = new Date(due.getTime() - task.remindBefore * 60000);
          if (remindTime <= now && due > now) {
            task.remindAlerted = true;
            changed = true;
            const payload = JSON.stringify({
              taskId: task.id,
              title: `⏰ 事前通知：[${group.name}] ${task.name}`,
              body: `${remindLabel(task.remindBefore)}です。期日：${dueDisplay(task.dueAt)}${task.detail ? '\n' + task.detail : ''}`,
              priority: task.priority
            });
            await pushToUsernames(targetUsernames, payload, debugErrors);
            totalNotified++;
          }
        }

        if (isRecurring && due <= now) {
          if (advanceRecurrence(task, now)) changed = true;
        }
      }

      if (changed) await setGroupTasks(groupId, tasks);
    }

    res.status(200).json({ users: usernames.length, checked: totalChecked, notified: totalNotified, debugErrors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
