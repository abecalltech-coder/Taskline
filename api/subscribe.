const { getSubscriptions, setSubscriptions } = require('./_db');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const sub = req.body;
      if (!sub || !sub.endpoint) {
        res.status(400).json({ error: '不正な購読情報です' });
        return;
      }
      const subs = await getSubscriptions();
      const exists = subs.some(s => s.endpoint === sub.endpoint);
      if (!exists) {
        subs.push(sub);
        await setSubscriptions(subs);
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
      const subs = await getSubscriptions();
      const next = subs.filter(s => s.endpoint !== body.endpoint);
      await setSubscriptions(next);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
