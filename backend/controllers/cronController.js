import { sendDailyFeedReminders } from '../services/notificationServices.js';
import { sendVaccinationReminders } from '../services/notificationServices.js';

export const runFeedReminders = async (req, res) => {
    try {
        console.log('🔄 Cron: Running feed reminders...');
        const result = await sendDailyFeedReminders();
        res.json({ success: true, message: 'Feed reminders completed', count: result?.sent || 0 });
    } catch (error) {
        console.error('Cron feed reminders error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const runVaccinationReminders = async (req, res) => {
    try {
        console.log('🔄 Cron: Running vaccination reminders...');
        const result = await sendVaccinationReminders();
        res.json({ success: true, message: 'Vaccination reminders completed', count: result?.sent || 0 });
    } catch (error) {
        console.error('Cron vaccination reminders error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const runAllReminders = async (req, res) => {
    try {
        console.log('🔄 Cron: Running all reminders...');
        const feedResult = await sendDailyFeedReminders();
        const vacResult = await sendVaccinationReminders();
        res.json({ 
            success: true, 
            message: 'All reminders completed', 
            count: (feedResult?.sent || 0) + (vacResult?.sent || 0) 
        });
    } catch (error) {
        console.error('Cron all reminders error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const healthCheck = async (req, res) => {
    res.json({ success: true, message: 'Cron endpoint healthy', timestamp: new Date().toISOString() });
};