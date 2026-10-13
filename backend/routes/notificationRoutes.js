import { operationsAuth } from '../middlewares/operationsAuth.js';
import * as notificationController from '../controllers/notificationController.js';
import { runReminders } from '../scheduler.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/validate.js';

const notificationRouter = express.Router();
notificationRouter.use(authMiddleware);

// Existing routes
notificationRouter.post('/send', validateBody({ required: ['title', 'message', 'type'] }), notificationController.createNotification);
notificationRouter.get('/all', notificationController.getAllNotifications);
notificationRouter.patch('/read-all', notificationController.markAllAsRead);
notificationRouter.patch('/:id/read', notificationController.markAsRead);
notificationRouter.delete('/:id', notificationController.deleteNotification);

// NEW: save device token (requires authentication)
notificationRouter.post('/register-token', validateBody({ required: ['token'] }), notificationController.saveDeviceToken);

// Compatibility routes use the same authorized, non-overlapping worker.
const triggerReminders = async (req, res, next) => {
  try {
    console.log(JSON.stringify({ event: 'operations_reminders_requested', actorId: req.user.id, requestId: req.requestId }));
    await runReminders();
    res.json({ success: true, message: 'Reminders completed' });
  } catch (error) { next(error); }
};
notificationRouter.post('/trigger-feed-reminders', operationsAuth, triggerReminders);
notificationRouter.post('/trigger-vaccination-reminders', operationsAuth, triggerReminders);

export default notificationRouter;