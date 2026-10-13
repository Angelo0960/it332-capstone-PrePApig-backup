// Explicit deployment allowlist; never trust client-supplied roles or emails.
export const operationsAuth = (req, res, next) => {
  const ids = (process.env.OPERATIONS_ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  if (!ids.includes(req.user.id)) return res.status(403).json({ success: false, message: 'Operations access required' });
  next();
};
