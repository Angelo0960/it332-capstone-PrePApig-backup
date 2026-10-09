import cron from 'node-cron';
import { sendDailyFeedReminders, sendVaccinationReminders } from './services/notificationServices.js';

const timezone = process.env.APP_TIMEZONE || 'Asia/Manila';

// Run daily at 8:00 AM in the configured farm timezone.
cron.schedule('0 8 * * *', async () => {
  console.log(JSON.stringify({ event: 'scheduled_reminders_started', timezone }));
  try {
    await sendDailyFeedReminders();
    await sendVaccinationReminders();
    console.log(JSON.stringify({ event: 'scheduled_reminders_completed' }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'scheduled_reminders_failed', message: error.message }));
  }
}, { timezone });

console.log(JSON.stringify({ event: 'scheduler_started', timezone }));