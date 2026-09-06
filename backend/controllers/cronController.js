import { sendDailyFeedReminders } from '../services/notificationServices.js';
import { sendVaccinationReminders } from '../services/notificationServices.js';

export const runFeedReminders = async (req, res) => {
    try {
        console.log('🔄 Cron: Running feed reminders...');
        await sendDailyFeedReminders();
        res.json({ success: true, message: 'Feed reminders completed' });
    } catch (error) {
        console.error('Cron feed reminders error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const runVaccinationReminders = async (req, res) => {
    try {
        console.log('🔄 Cron: Running vaccination reminders...');
        await sendVaccinationReminders();
        res.json({ success: true, message: 'Vaccination reminders completed' });
    } catch (error) {
        console.error('Cron vaccination reminders error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const runAllReminders = async (req, res) => {
    try {
        console.log('🔄 Cron: Running all reminders...');
        await sendDailyFeedReminders();
        await sendVaccinationReminders();
        res.json({ success: true, message: 'All reminders completed' });
    } catch (error) {
        console.error('Cron all reminders error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const healthCheck = async (req, res) => {
    res.json({ success: true, message: 'Cron endpoint healthy', timestamp: new Date().toISOString() });
};