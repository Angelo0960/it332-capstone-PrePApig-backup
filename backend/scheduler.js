import cron from 'node-cron';
import { sendDailyFeedReminders, sendVaccinationReminders, checkFeedChanges } from './services/notificationServices.js';

// Run daily at 6:00 AM
cron.schedule('0 6 * * *', async () => {
    console.log('⏰ Running daily notifications (6:00 AM)...');
    await sendDailyFeedReminders();
    await sendVaccinationReminders();
    await checkFeedChanges();
});

// Also run hourly for feed reminders (in case of missed)
cron.schedule('0 * * * *', async () => {
    console.log('⏰ Running hourly feed reminders...');
    await sendDailyFeedReminders();
});