import cron from 'node-cron';
import { sendDailyFeedReminders, sendVaccinationReminders } from './services/notificationServices.js';

// Run every hour at minute 0
cron.schedule('0 * * * *', async () => {
    console.log('⏰ Running hourly notifications...');
    await sendDailyFeedReminders();
    await sendVaccinationReminders();
});