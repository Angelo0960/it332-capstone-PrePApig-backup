import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';
import {
    getBatchVaccinationState,
    describeItems,
} from '../lib/vaccinationSchedule.js';

/**
 * Has this user already been told about this (type, batch) today?
 *
 * Scoped per batch so a user with several batches needing the same
 * reminder is notified about each one, instead of only the first.
 *
 * @param {string} userId
 * @param {string} type
 * @param {string|null} batchId
 * @param {string} today - YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
async function alreadyNotifiedToday(userId, type, batchId, today) {
    let query = supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', type)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .limit(1);

    // batch_id may not exist if the migration has not been run yet
    if (batchId) {
        query = query.eq('batch_id', batchId);
    }

    const { data, error } = await query;

    if (error) {
        // Never block a reminder on a failed dedupe check
        console.warn('⚠️ Dedupe check failed, sending anyway:', error.message);
        return false;
    }

    return Array.isArray(data) && data.length > 0;
}

/**
 * Save a notification and push it to the user's devices.
 *
 * Devices with no tokens are skipped for push, but the row is still saved
 * so the user sees it in the app.
 *
 * @returns {Promise<number>} 1 if saved, 0 if the insert failed
 */
async function sendNotification(userId, tokens, title, body, type, batchId = null) {
    const { error } = await supabase.from('notifications').insert([{
        user_id: userId,
        title,
        message: body,
        type,
        is_read: false,
        batch_id: batchId,
    }]);

    if (error) {
        console.error('❌ Error saving notification:', error.message);
        return 0;
    }

    if (tokens.length > 0) {
        const promises = tokens.map(token =>
            admin.messaging().send({
                token,
                notification: { title, body },
                data: { type, batchId: batchId || '' },
            }).catch(async err => {
                if (err.code === 'messaging/invalid-registration-token') {
                    await supabase.from('user_devices').delete().eq('fcm_token', token);
                }
                return null;
            })
        );
        await Promise.allSettled(promises);
    }

    return 1;
}

/**
 * Send daily feed reminders and overdue vaccination alerts.
 * Runs via cron job.
 */

// ----- Feed reminders (unchanged) -----
export const sendDailyFeedReminders = async () => {
    const today = new Date().toISOString().split('T')[0];

    console.log(`🔍 Checking feed records for ${today}...`);

    const { data: records, error } = await supabase
        .from('feed_records')
        .select(`
            id,
            quantity_kg,
            feeding_time,
            pig_batches (
                batch_code,
                owner_id
            )
        `)
        .eq('feeding_date', today)
        .eq('reminder_sent', false);

    if (error) {
        console.error('❌ Error fetching feed records:', error);
        return;
    }

    if (!records || records.length === 0) {
        console.log('✅ No pending feedings for today.');
        return;
    }

    console.log(`📋 Found ${records.length} pending feedings.`);

    const userMap = new Map();
    for (const rec of records) {
        const ownerId = rec.pig_batches?.owner_id;
        if (!ownerId) continue;
        if (!userMap.has(ownerId)) userMap.set(ownerId, []);
        userMap.get(ownerId).push(rec);
    }

    if (userMap.size === 0) {
        console.log('⚠️ No valid owner IDs found.');
        return;
    }

    for (const [ownerId, userRecords] of userMap) {
        const { data: devices, error: tokenError } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        if (tokenError) {
            console.error(`❌ Error fetching tokens for user ${ownerId}:`, tokenError);
            continue;
        }

        const tokens = devices.map(d => d.fcm_token);
        if (tokens.length === 0) {
            console.log(`⚠️ No tokens for user ${ownerId}, skipping.`);
            continue;
        }

        const batchCodes = [...new Set(userRecords.map(r => r.pig_batches?.batch_code || 'Unknown'))];
        const totalKg = userRecords.reduce((sum, r) => sum + Number(r.quantity_kg), 0);
        const title = `🐖 Daily Feed Reminder`;
        const body = `You have ${userRecords.length} feeding(s) today for: ${batchCodes.join(', ')}. Total: ${totalKg} kg.`;

        await supabase.from('notifications').insert([{
            title,
            message: body,
            type: 'feed_reminder',
            user_id: ownerId,
        }]);

        const sendPromises = tokens.map(token =>
            admin.messaging().send({
                token,
                notification: { title, body },
                data: { type: 'feed_reminder' },
            }).catch(async err => {
                if (err.code === 'messaging/invalid-registration-token') {
                    await supabase.from('user_devices').delete().eq('fcm_token', token);
                }
                return null;
            })
        );

        await Promise.allSettled(sendPromises);
        console.log(`✅ Sent feed reminders to user ${ownerId}`);
    }

    // Mark records as sent
    const recordIds = records.map(r => r.id);
    if (recordIds.length > 0) {
        await supabase.from('feed_records').update({ reminder_sent: true }).in('id', recordIds);
    }
};

// ----- Vaccination reminders (due + overdue, driven by the age schedule) -----
/**
 * Remind owners about vaccinations that are due or overdue for their
 * active batches.
 *
 * Due/overdue is derived from each batch's pig age against
 * VACCINATION_SCHEDULE, minus anything already recorded as Completed.
 * This is the same model the dashboard and the Vaccination screen use, so
 * all three agree.
 *
 * Each (user, type, batch) combination is notified at most once per day.
 */
export const sendVaccinationReminders = async () => {
    const today = new Date().toISOString().split('T')[0];

    console.log(`🔍 Checking vaccinations due or overdue for ${today}...`);

    // 1. Active batches, with the age fields needed to work out pig age
    const { data: batches, error: batchError } = await supabase
        .from('pig_batches')
        .select('id, batch_code, date_acquired, age_on_acquisition, owner_id')
        .eq('status', 'Active');

    if (batchError) {
        console.error('❌ Error fetching batches for vaccination check:', batchError.message);
        return { sent: 0 };
    }

    if (!batches || batches.length === 0) {
        console.log('✅ No active batches.');
        return { sent: 0 };
    }

    // 2. Completed vaccinations, so we never nag about something already given
    const { data: records, error: recordError } = await supabase
        .from('vaccination_records')
        .select('batch_id, vaccine_name, status');

    if (recordError) {
        console.error('❌ Error fetching vaccination records:', recordError.message);
        return { sent: 0 };
    }

    // 3. Work out what each batch is missing
    const alerts = [];
    for (const batch of batches) {
        if (!batch.owner_id || batch.owner_id === 'admin') continue;

        const state = getBatchVaccinationState(batch, records || []);
        if (state.due.length === 0 && state.overdue.length === 0) continue;

        alerts.push({ batch, state });
    }

    if (alerts.length === 0) {
        console.log('✅ No vaccinations due or overdue.');
        return { sent: 0 };
    }

    console.log(`📋 Found ${alerts.length} batch(es) with vaccinations due or overdue.`);

    // 4. Notify, grouped by owner so each user gets one push per batch+type
    const byOwner = new Map();
    for (const alert of alerts) {
        if (!byOwner.has(alert.batch.owner_id)) byOwner.set(alert.batch.owner_id, []);
        byOwner.get(alert.batch.owner_id).push(alert);
    }

    let sent = 0;

    for (const [ownerId, ownerAlerts] of byOwner) {
        const { data: devices } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        const tokens = devices?.map(d => d.fcm_token).filter(Boolean) || [];
        const batchCodes = [...new Set(ownerAlerts.map(a => a.batch.batch_code || 'Unknown'))].join(', ');

        for (const { batch, state } of ownerAlerts) {
            // One notification per batch per day. If anything is overdue we
            // lead with that and still mention what is merely due, rather
            // than firing a second alert for the same batch.
            const isOverdue = state.overdue.length > 0;
            const type = isOverdue ? 'vaccination_overdue' : 'vaccination_reminder';
            const title = isOverdue ? '⚠️ Vaccination Overdue' : '💉 Vaccination Due';

            const parts = [];
            if (isOverdue) parts.push(`Overdue: ${describeItems(state.overdue)}`);
            if (state.due.length > 0) parts.push(`Due now: ${describeItems(state.due)}`);

            if (await alreadyNotifiedToday(ownerId, type, batch.id, today)) {
                console.log(`⏭️  Skipped ${type} for ${batch.batch_code} (already sent today)`);
                continue;
            }

            const saved = await sendNotification(
                ownerId,
                tokens,
                title,
                `${batch.batch_code} - ${parts.join('. ')}`,
                type,
                batch.id
            );
            sent += saved;
        }

        if (ownerAlerts.length > 0) {
            console.log(`✅ Processed ${ownerAlerts.length} batch(es) for user ${ownerId} (${batchCodes})`);
        }
    }

    console.log(`✅ Sent ${sent} vaccination notification(s).`);
    return { sent };
};

// ----- Manual trigger for testing -----
export const triggerFeedReminders = async (req, res) => {
    try {
        await sendDailyFeedReminders();
        res.json({ success: true, message: 'Feed reminders triggered manually.' });
    } catch (err) {
        console.error('Manual trigger error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ----- Manual trigger for vaccination reminders (optional) -----
export const triggerVaccinationReminders = async (req, res) => {
    try {
        await sendVaccinationReminders();
        res.json({ success: true, message: 'Vaccination reminders triggered manually.' });
    } catch (err) {
        console.error('Manual trigger error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ============================================
// FEED CHANGE NOTIFICATIONS
// ============================================

import { 
  getNextFeedChange,
  isFeedChangeDue,
  isFeedChangeSoon,
  getAllFeedChanges
} from '../lib/feedScheduleService.js';

/**
 * Check for feed changes and send notifications
 * Runs daily via cron
 */
export const checkFeedChanges = async () => {
    console.log('🔍 Checking for feed changes...');

    // Get all active batches
    const { data: batches, error } = await supabase
        .from('pig_batches')
        .select('id, batch_code, date_acquired, age_on_acquisition, owner_id, pig_count, breed')
        .eq('status', 'Active');

    if (error) {
        console.error('❌ Error fetching batches for feed change check:', error);
        return;
    }

    if (!batches || batches.length === 0) {
        console.log('ℹ️ No active batches to check for feed changes.');
        return;
    }

    console.log(`📋 Checking ${batches.length} active batches for feed changes...`);

    let notificationsSent = 0;

    for (const batch of batches) {
        if (!batch.owner_id || batch.owner_id === 'admin') continue;

        // Skip if no owner devices
        const { data: devices } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', batch.owner_id);

        const tokens = devices?.map(d => d.fcm_token).filter(Boolean) || [];

        // Check if feed change is due or coming soon
        const nextChange = getNextFeedChange(batch);

        if (!nextChange) continue; // No more changes

        let notificationType = null;
        let title = '';
        let body = '';
        const notificationData = {
            type: 'feed_change',
            batchId: batch.id,
            batchCode: batch.batch_code
        };

        const today = new Date().toISOString().split('T')[0];

        if (isFeedChangeDue(batch)) {
            notificationType = 'feed_change_due';
            title = '🔄 Feed Change Due Today';
            body = `Batch ${batch.batch_code} should transition from ${nextChange.fromFeedType} (${nextChange.fromPhase}) to ${nextChange.toFeedType} (${nextChange.toPhase}) today.`;
            Object.assign(notificationData, {
                changeType: 'due',
                fromFeedType: nextChange.fromFeedType,
                toFeedType: nextChange.toFeedType,
                fromPhase: nextChange.fromPhase,
                toPhase: nextChange.toPhase,
                changeDate: nextChange.date
            });
        } else if (isFeedChangeSoon(batch, 3)) {
            notificationType = 'feed_change_upcoming';
            title = '⏰ Feed Change Coming Soon';
            body = `Batch ${batch.batch_code} will change from ${nextChange.fromFeedType} (${nextChange.fromPhase}) to ${nextChange.toFeedType} (${nextChange.toPhase}) in ${nextChange.daysUntil} day${nextChange.daysUntil !== 1 ? 's' : ''}.`;
            Object.assign(notificationData, {
                changeType: 'upcoming',
                fromFeedType: nextChange.fromFeedType,
                toFeedType: nextChange.toFeedType,
                fromPhase: nextChange.fromPhase,
                toPhase: nextChange.toPhase,
                changeDate: nextChange.date,
                daysUntil: nextChange.daysUntil
            });
        } else {
            continue; // No notification needed
        }

        // Dedupe per batch and per resolved type, so every batch needing a
        // change is reported exactly once per day
        if (await alreadyNotifiedToday(batch.owner_id, notificationType, batch.id, today)) {
            console.log(`⏭️  Skipped ${notificationType} for ${batch.batch_code} (already sent today)`);
            continue;
        }

        await sendNotification(
            batch.owner_id,
            tokens,
            title,
            body,
            notificationType,
            batch.id
        );

        // Push carries the richer payload the DB row cannot hold
        if (tokens.length > 0) {
            const sendPromises = tokens.map(token =>
                admin.messaging().send({
                    token,
                    notification: { title, body },
                    data: notificationData,
                }).catch(async err => {
                    if (err.code === 'messaging/invalid-registration-token') {
                        await supabase.from('user_devices').delete().eq('fcm_token', token);
                    }
                    return null;
                })
            );

            await Promise.allSettled(sendPromises);
        }

        console.log(`✅ Sent ${notificationType} for batch ${batch.batch_code} to user ${batch.owner_id}`);
        notificationsSent++;
    }

    console.log(`✅ Feed change check complete. Sent ${notificationsSent} notifications.`);
};

// ----- Manual trigger for testing -----
export const triggerFeedChangeCheck = async (req, res) => {
    try {
        await checkFeedChanges();
        res.json({ success: true, message: 'Feed change check triggered manually.' });
    } catch (err) {
        console.error('Manual trigger error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};