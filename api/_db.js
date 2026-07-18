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

async function getTasks() {
  const raw = await redisCmd(['GET', 'tasks']);
  return raw ? JSON.parse(raw) : [];
}

async function setTasks(tasks) {
  await redisCmd(['SET', 'tasks', JSON.stringify(tasks)]);
}

async function getSubscriptions() {
  const raw = await redisCmd(['GET', 'subscriptions']);
  return raw ? JSON.parse(raw) : [];
}

async function setSubscriptions(subs) {
  await redisCmd(['SET', 'subscriptions', JSON.stringify(subs)]);
}

module.exports = { getTasks, setTasks, getSubscriptions, setSubscriptions };
