import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';
import { triggerFeedReminders as triggerFeedRemindersService } from '../services/notificationServices.js';

// ---------- Helper function ----------
export const sendNotificationToUser = async (userId, title, message, type) => {
    const { data: devices, error } = await supabase
        .from('user_devices')
        .select('fcm_token')
        .eq('user_id', userId);

    if (error || !devices || devices.length === 0) return;

    const tokens = devices.map(d => d.fcm_token);
    const sendPromises = tokens.map(token =>
        admin.messaging().send({
            token,
            notification: { title, body: message },
            data: { type },
        }).catch(async err => {
            if (err.code === 'messaging/invalid-registration-token') {
                await supabase.from('user_devices').delete().eq('fcm_token', token);
            }
            return null;
        })
    );

    await Promise.allSettled(sendPromises);
};

// ---------- Create and Send Notification ----------
export const createNotification = async (req, res) => {
    try {
        const { title, message, type, userId, recipient_token } = req.body;

        // If userId is provided, send to all devices of that user
        if (userId) {
            await sendNotificationToUser(userId, title, message, type);
            // Save to notifications table with user_id
            const { data, error } = await supabase
                .from('notifications')
                .insert([{ title, message, type, user_id: userId }])
                .select();
            if (error) throw error;
            return res.status(201).json({
                success: true,
                message: 'Notification sent to user',
                data
            });
        }

        // Fallback: send to a single recipient_token (old behavior)
        if (recipient_token) {
            const { data, error } = await supabase
                .from('notifications')
                .insert([{ title, message, type, recipient_token }])
                .select();
            if (error) throw error;

            await admin.messaging().send({
                token: recipient_token,
                notification: { title, body: message },
            });

            return res.status(201).json({
                success: true,
                message: 'Notification sent to token',
                data
            });
        }

        return res.status(400).json({
            success: false,
            message: 'Either userId or recipient_token is required'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------- View All Notifications ----------
export const getAllNotifications = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ---------- Mark Notification as Read ----------
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ---------- Delete Notification ----------
export const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: "Notification deleted"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ---------- Save Device Token (with admin skip) ----------
export const saveDeviceToken = async (req, res) => {
    try {
        const { token } = req.body;
        const userId = req.user.id; // from authMiddleware

        // Skip for admin (hardcoded user)
        if (userId === 'admin') {
            return res.json({
                success: true,
                message: 'Admin token registration skipped (no real user in Supabase)',
            });
        }

        const { data, error } = await supabase
            .from('user_devices')
            .upsert(
                { user_id: userId, fcm_token: token, updated_at: new Date() },
                { onConflict: 'fcm_token' }
            )
            .select();

        if (error) throw error;

        res.json({ success: true, message: 'Device token saved', data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------- Manual Trigger (for testing) ----------
export const triggerFeedReminders = triggerFeedRemindersService;