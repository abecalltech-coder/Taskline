module.exports = async (req, res) => {
  res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
};
