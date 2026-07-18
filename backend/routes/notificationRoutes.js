import * as notificationController from '../controllers/notificationController.js';
import { sendVaccinationReminders } from '../services/notificationServices.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const notificationRouter = express.Router();

// Existing routes
notificationRouter.post('/send', notificationController.createNotification);
notificationRouter.get('/all', notificationController.getAllNotifications);
notificationRouter.patch('/:id/read', notificationController.markAsRead);
notificationRouter.delete('/:id', notificationController.deleteNotification);

// NEW: save device token (requires authentication)
notificationRouter.post('/register-token', authMiddleware, notificationController.saveDeviceToken);

// NEW: manual trigger for testing (optionally protected)
notificationRouter.post('/trigger-feed-reminders', notificationController.triggerFeedReminders);

notificationRouter.post('/trigger-vaccination-reminders', async (req, res) => {
  try {
    await sendVaccinationReminders();
    res.json({ success: true, message: 'Vaccination reminders triggered.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default notificationRouter;