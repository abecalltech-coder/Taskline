const { getSubscriptions, setSubscriptions } = require('./_db');
const { getAuthUser } = require('./_auth');

module.exports = async (req, res) => {
  try {
    const username = await getAuthUser(req);
    if (!username) {
      res.status(401).json({ error: 'ログインが必要です' });
      return;
    }

    if (req.method === 'POST') {
      const sub = req.body;
      if (!sub || !sub.endpoint) {
        res.status(400).json({ error: '不正な購読情報です' });
        return;
      }
      const subs = await getSubscriptions(username);
      const exists = subs.some(s => s.endpoint === sub.endpoint);
      if (!exists) {
        subs.push(sub);
        await setSubscriptions(username, subs);
      }
      res.status(201).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const body = req.body || {};
      if (!body.endpoint) {
        res.status(400).json({ error: 'endpoint は必須です' });
        return;
      }
      const subs = await getSubscriptions(username);
      const next = subs.filter(s => s.endpoint !== body.endpoint);
      await setSubscriptions(username, next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
