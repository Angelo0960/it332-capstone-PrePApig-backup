const isMissing = (value) => value === undefined || value === null || value === '';

export const validateBody = ({ required = [], nonNegative = [] } = {}) => (req, res, next) => {
  const body = req.body || {};
  const missing = required.filter((field) => isMissing(body[field]));
  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    });
  }

  for (const field of nonNegative) {
    if (body[field] !== undefined && (!Number.isFinite(Number(body[field])) || Number(body[field]) < 0)) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a non-negative number`,
      });
    }
  }

  next();
};

export const validateAuthConfig = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
};
