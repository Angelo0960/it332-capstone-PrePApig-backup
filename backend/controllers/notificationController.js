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
        const { title, message, type } = req.body;
        const userId = req.user.id;
        if (!title || !message || !type) {
            return res.status(400).json({ success: false, message: 'Title, message, and type are required' });
        }

        await sendNotificationToUser(userId, title, message, type);
        const { data, error } = await supabase
            .from('notifications')
            .insert([{ title, message, type, user_id: userId }])
            .select();
        if (error) throw error;

        return res.status(201).json({
            success: true,
            message: 'Notification sent to user',
            data,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------- View All Notifications ----------
export const getAllNotifications = async (req, res) => {
    try {
        const limit = req.query.limit ? Math.min(Math.max(Number(req.query.limit) || 50, 1), 200) : null;
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        let query = supabase
            .from('notifications')
            .select('id,user_id,title,message,type,is_read,created_at')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });
        if (limit !== null) query = query.range(offset, offset + limit - 1);
        const { data, error } = await query;

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
            .eq('user_id', req.user.id)
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

export const markAllAsRead = async (req, res) => {
    try {
        const query = supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('is_read', false);
        query.eq('user_id', req.user.id);
        const { data, error } = await query.select('id');

        if (error) throw error;
        res.json({ success: true, count: data?.length || 0 });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------- Delete Notification ----------
export const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);

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

// ---------- Save Device Token ----------
export const saveDeviceToken = async (req, res) => {
    try {
        const { token } = req.body;
        const userId = req.user.id; // from authMiddleware


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