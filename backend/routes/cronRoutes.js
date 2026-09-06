import express from 'express';
import * as cronController from '../controllers/cronController.js';

const cronRouter = express.Router();

// Health check (no auth needed for monitoring)
cronRouter.get('/health', cronController.healthCheck);

// Cron authentication middleware
const cronAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('CRON_SECRET not configured');
        return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    if (token !== cronSecret) {
        return res.status(401).json({ success: false, message: 'Invalid cron secret' });
    }

    next();
};

// Apply auth to all cron routes except health
cronRouter.use(cronAuth);

// Individual reminder endpoints
cronRouter.post('/feed-reminders', cronController.runFeedReminders);
cronRouter.post('/vaccination-reminders', cronController.runVaccinationReminders);

// Combined endpoint (for single cron job)
cronRouter.post('/run-all', cronController.runAllReminders);

export default cronRouter;