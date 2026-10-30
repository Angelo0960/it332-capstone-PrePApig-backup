import cron from 'node-cron';
import { sendDailyFeedReminders, sendVaccinationReminders } from './services/notificationServices.js';
import { refreshPigMarketPrices } from './services/pigMarketPriceHistoryService.js';
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

export const marketPriceWorkerStatus = { enabled: process.env.MARKET_PRICE_REFRESH_ENABLED !== 'false', running: false, lastStartedAt: null, lastFinishedAt: null, lastOutcome: null };
export const runMarketPriceRefresh = async () => {
  if (marketPriceWorkerStatus.running) throw Object.assign(new Error('Market price worker already running'), { status: 409 });
  marketPriceWorkerStatus.running = true;
  marketPriceWorkerStatus.lastStartedAt = new Date().toISOString();
  try {
    if (!process.env.GOOGLE_SEARCH_API_KEY && !process.env.SERPER_API_KEY) {
      marketPriceWorkerStatus.lastOutcome = 'skipped_search_not_configured';
      return null;
    }
    const result = await refreshPigMarketPrices();
    marketPriceWorkerStatus.lastOutcome = `refreshed_${result.savedCount || 0}`;
    return result;
  } catch (error) {
    marketPriceWorkerStatus.lastOutcome = 'failed';
    throw error;
  } finally {
    marketPriceWorkerStatus.running = false;
    marketPriceWorkerStatus.lastFinishedAt = new Date().toISOString();
    console.log(JSON.stringify({ event: 'market_price_worker_finished', ...marketPriceWorkerStatus }));
  }
};
if (marketPriceWorkerStatus.enabled) cron.schedule('15 2 * * *', () => runMarketPriceRefresh().catch(error => {
  console.error(JSON.stringify({ event: 'market_price_worker_failed', message: error.message }));
}), { timezone });
