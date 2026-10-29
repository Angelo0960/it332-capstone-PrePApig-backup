import cron from 'node-cron';
import { sendDailyFeedReminders, sendVaccinationReminders } from './services/notificationServices.js';
const timezone = process.env.APP_TIMEZONE || 'Asia/Manila';
export const workerStatus = { enabled: process.env.REMINDER_WORKER_ENABLED !== 'false', running: false, lastStartedAt: null, lastFinishedAt: null, lastOutcome: null };
export const runReminders = async () => {
  if (workerStatus.running) throw Object.assign(new Error('Reminder worker already running'), { status: 409 });
  workerStatus.running = true;
  workerStatus.lastStartedAt = new Date().toISOString();
  try {
    await sendDailyFeedReminders();
    await sendVaccinationReminders();
    workerStatus.lastOutcome = 'scan_completed';
  } catch (error) {
    workerStatus.lastOutcome = 'failed';
    throw error;
  } finally {
    workerStatus.running = false;
    workerStatus.lastFinishedAt = new Date().toISOString();
    console.log(JSON.stringify({ event: 'reminder_worker_finished', ...workerStatus }));
  }
};
if (workerStatus.enabled) cron.schedule('* * * * *', () => runReminders().catch(error => {
  console.error(JSON.stringify({ event: 'reminder_worker_failed', message: error.message }));
}), { timezone });
