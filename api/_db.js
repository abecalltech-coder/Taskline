const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN が設定されていません');
  }
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(cmd)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redis error (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.result;
}

async function getJSON(key, fallback) {
  const raw = await redisCmd(['GET', key]);
  return raw ? JSON.parse(raw) : fallback;
}

async function setJSON(key, value) {
  await redisCmd(['SET', key, JSON.stringify(value)]);
}

async function getUsers() { return getJSON('users', {}); }
async function setUsers(users) { return setJSON('users', users); }

async function getSessions() { return getJSON('sessions', {}); }
async function setSessions(sessions) { return setJSON('sessions', sessions); }

async function getTasks(username) { return getJSON(`tasks:${username}`, []); }
async function setTasks(username, tasks) { return setJSON(`tasks:${username}`, tasks); }

async function getSubscriptions(username) { return getJSON(`subscriptions:${username}`, []); }
async function setSubscriptions(username, subs) { return setJSON(`subscriptions:${username}`, subs); }

async function getGroups() { return getJSON('groups', {}); }
async function setGroups(groups) { return setJSON('groups', groups); }

async function getGroupTasks(groupId) { return getJSON(`groupTasks:${groupId}`, []); }
async function setGroupTasks(groupId, tasks) { return setJSON(`groupTasks:${groupId}`, tasks); }

module.exports = {
  getUsers, setUsers,
  getSessions, setSessions,
  getTasks, setTasks,
  getSubscriptions, setSubscriptions,
  getGroups, setGroups,
  getGroupTasks, setGroupTasks
};
