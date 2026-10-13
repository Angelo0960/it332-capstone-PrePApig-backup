import { timingSafeEqual } from 'node:crypto';

export const internalMiddleware = (req, res, next) => {
  const expected = process.env.INTERNAL_REMINDER_TOKEN;
  if (!expected || expected.length < 32) return res.status(503).json({ success: false, message: 'Internal reminder triggers are disabled' });
  const supplied = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return res.status(403).json({ success: false, message: 'Internal authorization required' });
  next();
};
