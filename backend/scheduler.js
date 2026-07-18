import cron from 'node-cron';
import { sendDailyFeedReminders, sendVaccinationReminders } from './services/notificationServices.js';

// Run daily at 8:00 AM
cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Running daily reminders...');
    await sendDailyFeedReminders();
    await sendVaccinationReminders();
});

console.log('✅ Scheduler started.');