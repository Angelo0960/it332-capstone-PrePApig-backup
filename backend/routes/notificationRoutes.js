import * as notificationController from '../controllers/notificationController.js';
import { sendVaccinationReminders } from '../services/notificationServices.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { internalMiddleware } from '../middlewares/internalMiddleware.js';
import { validateBody } from '../middlewares/validate.js';

const notificationRouter = express.Router();


// Internal operational triggers; ordinary user tokens are not accepted.
notificationRouter.post('/trigger-feed-reminders', internalMiddleware, notificationController.triggerFeedReminders);

notificationRouter.post('/trigger-vaccination-reminders', internalMiddleware, async (req, res) => {
  try {
    await sendVaccinationReminders();
    res.json({ success: true, message: 'Vaccination reminders triggered.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


notificationRouter.use(authMiddleware);

// Existing routes
notificationRouter.post('/send', validateBody({ required: ['title', 'message', 'type'] }), notificationController.createNotification);
notificationRouter.get('/all', notificationController.getAllNotifications);
notificationRouter.patch('/read-all', notificationController.markAllAsRead);
notificationRouter.patch('/:id/read', notificationController.markAsRead);
notificationRouter.delete('/:id', notificationController.deleteNotification);

// NEW: save device token (requires authentication)
notificationRouter.post('/register-token', validateBody({ required: ['token'] }), notificationController.saveDeviceToken);


export default notificationRouter;