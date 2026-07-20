const crypto = require('crypto');
const { getUsers, setUsers, getSessions, setSessions } = require('../lib/db');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    const { action, username, password } = req.body || {};
    if (!username || !password || !action) {
      res.status(400).json({ error: 'username, password, action は必須です' });
      return;
    }
    const cleanUsername = String(username).trim().toLowerCase();
    if (!/^[a-z0-9_\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFFー]{3,20}$/u.test(cleanUsername)) {
      res.status(400).json({ error: 'ユーザーIDは半角英数字・ひらがな・カタカナ・漢字・-・_のみ、3〜20文字で入力してください' });
      return;
    }
    if (String(password).length < 4) {
      res.status(400).json({ error: 'パスワードは4文字以上にしてください' });
      return;
    }

    const users = await getUsers();

    if (action === 'signup') {
      if (users[cleanUsername]) {
        res.status(409).json({ error: 'そのユーザーIDは既に使われています' });
        return;
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);
      users[cleanUsername] = { salt, passwordHash, createdAt: new Date().toISOString() };
      await setUsers(users);
    } else if (action === 'login') {
      const user = users[cleanUsername];
      if (!user) {
        res.status(401).json({ error: 'ユーザーIDまたはパスワードが違います' });
        return;
      }
      const attemptHash = hashPassword(password, user.salt);
      if (attemptHash !== user.passwordHash) {
        res.status(401).json({ error: 'ユーザーIDまたはパスワードが違います' });
        return;
      }
    } else {
      res.status(400).json({ error: '不正なactionです' });
      return;
    }

    const sessions = await getSessions();
    const token = makeToken();
    sessions[token] = cleanUsername;
    await setSessions(sessions);

    res.status(200).json({ token, username: cleanUsername });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
