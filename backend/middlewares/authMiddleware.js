import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

const revokedTokens = new Map();

export const revokeToken = (token, expiresAt) => {
    revokedTokens.set(token, expiresAt || Date.now() + 24 * 60 * 60 * 1000);
};

const isTokenRevoked = (token) => {
    const expiresAt = revokedTokens.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
        revokedTokens.delete(token);
        return false;
    }
    return true;
};

export const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (isTokenRevoked(token)) {
        return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.jti) {
            const { data: validSession, error } = await supabase.rpc('validate_session_token', {
                p_jti: decoded.jti,
                p_user_id: decoded.id,
            });

            if (error) {
                return res.status(503).json({ success: false, message: 'Session validation is unavailable' });
            }

            if (validSession !== true) {
                return res.status(401).json({ success: false, message: 'Session has expired or been revoked' });
            }
        }

        req.user = { id: decoded.id, email: decoded.email };
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};