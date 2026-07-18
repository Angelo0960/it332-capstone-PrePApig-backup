import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    console.log('🔑 Auth header:', authHeader);  // <-- LOG

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ No Bearer token');
        return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    console.log('🔐 Token received:', token.substring(0, 20) + '...'); // partial for safety

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Decoded token:', decoded);
        req.user = { id: decoded.id, email: decoded.email };
        next();
    } catch (err) {
        console.error('❌ JWT verification failed:', err.message);
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};