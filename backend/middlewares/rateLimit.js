// Process-local fixed windows. Expired entries are removed on each request;
// deployments with multiple replicas should use a shared gateway limiter.
export const rateLimit = ({ limit, windowMs, key = (req) => req.ip }) => {
  const windows = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [id, entry] of windows) if (entry.expires <= now) windows.delete(id);
    const id = key(req);
    const entry = windows.get(id) || { count: 0, expires: now + windowMs };
    if (entry.count >= limit || (!windows.has(id) && windows.size >= 10000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.expires - now) / 1000))));
      return res.status(429).json({ success: false, message: 'Too many requests; please try again later' });
    }
    entry.count += 1;
    windows.set(id, entry);
    next();
  };
};
