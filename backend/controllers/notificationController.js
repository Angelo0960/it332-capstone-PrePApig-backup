import { pagination } from '../services/pagination.js';
import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';
import { triggerFeedReminders as triggerFeedRemindersService } from '../services/notificationServices.js';

// ---------- Helper function ----------
export const sendNotificationToUser = async (userId, title, message, type, requestId) => {
    const { data: devices, error } = await supabase
        .from('user_devices')
        .select('fcm_token')
        .eq('user_id', userId);

    if (error) {
        console.error(JSON.stringify({ event: 'push_delivery_lookup_failed', requestId, userId, message: error.message }));
        return { status: 'lookup_failed', deviceCount: 0, sentCount: 0 };
    }
    if (!devices || devices.length === 0) {
        console.warn(JSON.stringify({ event: 'push_delivery_no_devices', requestId, userId, deviceCount: 0 }));
        return { status: 'no_registered_device', deviceCount: 0, sentCount: 0 };
    }

    const tokens = devices.map(d => d.fcm_token);
    const results = await Promise.all(tokens.map(async (token) => {
        try {
            const result = await admin.messaging().send({
                token,
                notification: { title, body: message },
                data: { type },
            });
            if (result?.skipped) return { sent: false, code: 'firebase_not_configured' };
            return { sent: true };
        } catch (err) {
            console.error(JSON.stringify({ event: 'push_delivery_failed', requestId, userId, code: err.code || 'unknown' }));
            if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
                await supabase.from('user_devices').delete().eq('fcm_token', token);
            }
            return { sent: false, code: err.code || 'unknown' };
        }
    }));

    const sentCount = results.filter((result) => result.sent).length;
    const status = sentCount > 0 ? 'sent' : results.some((result) => result.code === 'firebase_not_configured') ? 'firebase_not_configured' : 'delivery_failed';
    console.log(JSON.stringify({ event: 'push_delivery_completed', requestId, userId, deviceCount: devices.length, sentCount, status }));
    return { status, deviceCount: devices.length, sentCount };
};

// ---------- Create and Send Notification ----------
export const createNotification = async (req, res) => {
    try {
        const { title, message, type } = req.body;
        const userId = req.user.id;
        if (!title || !message || !type) {
            return res.status(400).json({ success: false, message: 'Title, message, and type are required' });
        }

        const delivery = await sendNotificationToUser(userId, title, message, type, req.requestId);
        const { data, error } = await supabase
            .from('notifications')
            .insert([{ title, message, type, user_id: userId }])
            .select();
        if (error) throw error;

        return res.status(201).json({
            success: true,
            message: delivery.status === 'sent' ? 'Notification sent to user' : 'Notification saved, but push delivery was not completed',
            delivery,
            data,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------- View All Notifications ----------
export const getAllNotifications = async (req, res) => {
    try {
        const { limit, offset } = pagination(req.query);
        let query = supabase
            .from('notifications')
            .select('id,user_id,title,message,type,is_read,created_at')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });
        query = query.order('id', { ascending: false }).range(offset, offset + limit - 1);
        const { data, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            pagination: { limit, offset },
            data
        });
    } catch (error) {
        res.status(error.status || 500).json({
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