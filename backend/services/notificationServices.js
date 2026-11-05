import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';
import { getAgeOnDate, getVaccinationScheduleForAge, getCompletedVaccinationScheduleKeys } from '../utils/vaccinationSchedule.js';

const DEFAULT_NOTIFICATION_PREFERENCES = { feed_reminders: true, vaccination_reminders: true, push_enabled: true };
let missingPreferencesTableLogged = false;

async function preferencesFor(userId) {
    const { data, error } = await supabase.from('notification_preferences').select('feed_reminders,vaccination_reminders,push_enabled').eq('user_id', userId).maybeSingle();
    if (error) {
        if (['42P01', 'PGRST205'].includes(error.code)) {
            if (!missingPreferencesTableLogged) {
                console.warn(JSON.stringify({ event: 'notification_preferences_table_missing', fallback: 'defaults' }));
                missingPreferencesTableLogged = true;
            }
            return DEFAULT_NOTIFICATION_PREFERENCES;
        }
        throw new Error(`Unable to read notification preferences (${error.code || 'unknown'})`);
    }
    return data || DEFAULT_NOTIFICATION_PREFERENCES;
}

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Manila';
const getDateTimeInTimezone = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    };
};

const DAILY_FEED_REMINDER_MINUTES = 17 * 60;
const DAILY_FEED_REMINDER_LABEL = '5:00 PM';
const buildBatchDisplayNames = (batches) => {
    const owners = new Map();
    for (const batch of batches || []) {
        if (!batch.owner_id) continue;
        if (!owners.has(batch.owner_id)) owners.set(batch.owner_id, []);
        owners.get(batch.owner_id).push(batch);
    }
    const names = new Map();
    for (const ownerBatches of owners.values()) {
        ownerBatches.sort((left, right) => {
            const leftDate = left.created_at || left.date_acquired || '';
            const rightDate = right.created_at || right.date_acquired || '';
            return String(leftDate).localeCompare(String(rightDate)) || String(left.id).localeCompare(String(right.id));
        });
        ownerBatches.forEach((batch, index) => names.set(String(batch.id), `Batch-${String(index + 1).padStart(2, '0')}`));
    }
    return names;
};

const createNotificationOnce = async ({ ownerId, title, message, type, dedupeKey }) => {
    const { data: existing, error: lookupError } = await supabase.from('notifications')
        .select('id')
        .eq('user_id', ownerId)
        .eq('dedupe_key', dedupeKey)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return false;

    const { data, error } = await supabase.from('notifications').insert({
        user_id: ownerId,
        title,
        message,
        type,
        dedupe_key: dedupeKey,
    }).select('id').maybeSingle();
    if (error?.code === '23505') return false;
    if (error) throw error;
    return Boolean(data?.id);
};

const sendPushNotification = async (ownerId, preferences, { type, title, body, ...extraData }) => {
    if (!preferences.push_enabled) return;
    const { data: devices, error } = await supabase.from('user_devices').select('fcm_token').eq('user_id', ownerId);
    if (error) {
        console.error(JSON.stringify({ event: 'notification_device_lookup_failed', ownerId, code: error.code || 'unknown' }));
        return;
    }
    const tokens = [...new Set((devices || []).map((device) => device.fcm_token).filter(Boolean))];
    if (tokens.length === 0) {
        console.warn(JSON.stringify({ event: 'notification_push_unavailable', ownerId, type, reason: 'no_registered_devices' }));
        return;
    }
    await Promise.allSettled(tokens.map(async (token) => {
        try {
            const result = await admin.messaging().send({
                token,
                data: { type, title, body, ...extraData },
            });
            if (result?.skipped) {
                console.warn(JSON.stringify({ event: 'notification_push_skipped', ownerId, type }));
            } else {
                console.log(JSON.stringify({ event: 'notification_push_accepted', ownerId, type, messageId: result }));
            }
        } catch (error) {
            if (['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(error.code)) {
                await supabase.from('user_devices').delete().eq('fcm_token', token);
            }
            console.error(JSON.stringify({ event: 'notification_push_failed', ownerId, type, code: error.code || 'unknown' }));
        }
    }));
};

/**
 * Send daily feed reminders and overdue vaccination alerts.
 * Runs via cron job.
 */

// ----- Daily missed-feed reminders -----
export const sendDailyFeedReminders = async () => {
    const { date: today, minutes: currentMinutes } = getDateTimeInTimezone();
    if (currentMinutes < DAILY_FEED_REMINDER_MINUTES) return;

    const { data: batches, error: batchError } = await supabase
        .from('pig_batches')
        .select('id,owner_id,date_acquired,created_at,status')
        .order('created_at', { ascending: true });
    if (batchError) throw batchError;
    const allBatches = batches || [];
    const activeBatches = allBatches.filter((batch) => batch.owner_id && (!batch.status || String(batch.status).toLowerCase() === 'active'));
    if (activeBatches.length === 0) return;

    const { data: todaysRecords, error: feedError } = await supabase
        .from('feed_records')
        .select('batch_id')
        .eq('feeding_date', today);
    if (feedError) throw feedError;
    const fedBatchIds = new Set((todaysRecords || []).map((record) => String(record.batch_id)));
    const missingBatches = activeBatches.filter((batch) => !fedBatchIds.has(String(batch.id)));
    if (missingBatches.length === 0) return;

    const displayNames = buildBatchDisplayNames(allBatches);
    const byOwner = new Map();
    for (const batch of missingBatches) {
        if (!byOwner.has(batch.owner_id)) byOwner.set(batch.owner_id, []);
        byOwner.get(batch.owner_id).push(batch);
    }

    for (const [ownerId, ownerBatches] of byOwner) {
        const preferences = await preferencesFor(ownerId);
        if (!preferences.feed_reminders) continue;
        const batchNames = ownerBatches.map((batch) => displayNames.get(String(batch.id)) || 'Your batch');
        const title = '⚠️ Feed Not Recorded';
        const body = `No feed has been recorded for ${batchNames.join(', ')} for today’s scheduled ${DAILY_FEED_REMINDER_LABEL} feeding.`;
        const inserted = await createNotificationOnce({
            ownerId,
            title,
            message: body,
            type: 'feed_delayed',
            dedupeKey: `feed_delayed:${today}`,
        });
        if (!inserted) continue;
        await sendPushNotification(ownerId, preferences, { type: 'feed_delayed', title, body });
        console.log(JSON.stringify({ event: 'delayed_feed_notification_created', ownerId, batchCount: ownerBatches.length, date: today }));
    }
};

// ----- Feed-stage change reminders (five days before the change) -----
export const sendFeedChangeReminders = async () => {
    const { date: today } = getDateTimeInTimezone();
    const dayMs = 24 * 60 * 60 * 1000;
    const todayUtc = new Date(`${today}T00:00:00Z`);
    const stageChanges = [
        { day: 29, from: 'pre-starter', to: 'Starter Mash' },
        { day: 71, from: 'Starter Mash', to: 'Grower Pellet' },
        { day: 106, from: 'Grower Pellet', to: 'Finisher' },
    ];

    const { data: batches, error } = await supabase
        .from('pig_batches')
        .select('id,batch_code,owner_id,age_on_acquisition,date_acquired,created_at,status');

    if (error) throw error;

    const activeBatches = (batches || []).filter((batch) => !batch.status || String(batch.status).toLowerCase() === 'active');
    const displayNames = buildBatchDisplayNames(batches || []);

    const upcoming = [];
    for (const batch of activeBatches) {
        const sourceDate = batch.date_acquired || batch.created_at;
        if (!sourceDate || !batch.owner_id) continue;
        const sourceDateOnly = String(sourceDate).slice(0, 10);
        const acquiredUtc = new Date(`${sourceDateOnly}T00:00:00Z`);
        if (Number.isNaN(acquiredUtc.getTime())) continue;
        const age = (Number(batch.age_on_acquisition) || 0) + Math.max(0, Math.floor((todayUtc - acquiredUtc) / dayMs));
        const change = stageChanges.find((item) => item.day - age >= 0 && item.day - age <= 5);
        if (change) upcoming.push({ batch, change, daysUntil: change.day - age });
    }

    for (const { batch, change, daysUntil } of upcoming) {
        const preferences = await preferencesFor(batch.owner_id);
        if (!preferences.feed_reminders) continue;
        const dedupeKey = `feed_stage_change:${batch.id}:${change.day}`;
        const { data: existing, error: existingError } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', batch.owner_id)
            .eq('dedupe_key', dedupeKey)
            .maybeSingle();
        if (existingError) throw existingError;
        if (existing) continue;

        const title = '🐖 Feed Type Change Reminder';
        const batchName = displayNames.get(String(batch.id)) || 'Your pig batch';
        const body = daysUntil === 0
            ? `${batchName} changes from ${change.from} to ${change.to} today.`
            : `${batchName} will change from ${change.from} to ${change.to} in ${daysUntil} day${daysUntil === 1 ? '' : 's'} (Day ${change.day}).`;
        const { error: insertError } = await supabase.from('notifications').insert({
            title,
            message: body,
            type: 'feed_stage_change',
            user_id: batch.owner_id,
            dedupe_key: dedupeKey,
        });
        if (insertError) throw insertError;

        if (!preferences.push_enabled) continue;
        const { data: devices, error: tokenError } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', batch.owner_id);
        if (tokenError) {
            console.error(`❌ Error fetching tokens for user ${batch.owner_id}:`, tokenError);
            continue;
        }
        const tokens = [...new Set((devices || []).map((device) => device.fcm_token).filter(Boolean))];
        await Promise.allSettled(tokens.map((token) => admin.messaging().send({
            token,
            data: { type: 'feed_stage_change', title, body, batchId: String(batch.id), changeDay: String(change.day) },
        }).catch(async (sendError) => {
            if (sendError.code === 'messaging/invalid-registration-token' || sendError.code === 'messaging/registration-token-not-registered') {
                await supabase.from('user_devices').delete().eq('fcm_token', token);
            }
            console.error(JSON.stringify({ event: 'feed_stage_change_delivery_failed', ownerId: batch.owner_id, code: sendError.code || 'unknown' }));
        })));
    }
};

// ----- Vaccination reminders derived from the same age schedule shown in the UI -----
export const sendVaccinationReminders = async () => {
    const { date: today } = getDateTimeInTimezone();
    const todayUtc = new Date(`${today}T00:00:00.000Z`);
    const dayMs = 24 * 60 * 60 * 1000;

    const { data: batches, error: batchError } = await supabase
        .from('pig_batches')
        .select('id,owner_id,age_on_acquisition,date_acquired,created_at,status')
        .order('created_at', { ascending: true });
    if (batchError) throw batchError;
    const allBatches = batches || [];
    const activeBatches = allBatches.filter((batch) => batch.owner_id && (!batch.status || String(batch.status).toLowerCase() === 'active'));
    if (activeBatches.length === 0) return;

    const { data: records, error: recordsError } = await supabase
        .from('vaccination_records')
        .select('batch_id,vaccine_name,vaccination_date,created_at,status');
    if (recordsError) throw recordsError;

    const displayNames = buildBatchDisplayNames(allBatches);
    const dueByOwner = new Map();
    for (const batch of activeBatches) {
        const sourceDate = batch.date_acquired || batch.created_at;
        if (!sourceDate) continue;
        const age = getAgeOnDate(batch, today);
        if (!Number.isFinite(age)) continue;
        const occurrences = getVaccinationScheduleForAge(age, false).filter((vaccine) => vaccine.day <= age);
        const completed = getCompletedVaccinationScheduleKeys({
            batch,
            records: records || [],
            occurrences,
            currentAge: age,
            currentDate: today,
        });
        const pendingVaccines = [];
        for (const vaccine of occurrences) {
            if (completed.has(vaccine.key)) continue;
            const overdueDays = Math.max(0, age - vaccine.day);
            pendingVaccines.push({
                name: vaccine.label,
                overdueDays,
                status: overdueDays > 0 ? 'overdue' : 'due',
                scheduledDay: vaccine.day,
            });
        }
        if (pendingVaccines.length === 0) continue;
        if (!dueByOwner.has(batch.owner_id)) dueByOwner.set(batch.owner_id, []);
        dueByOwner.get(batch.owner_id).push({ batch, pendingVaccines });
    }

    for (const [ownerId, ownerBatches] of dueByOwner) {
        const preferences = await preferencesFor(ownerId);
        if (!preferences.vaccination_reminders) continue;
        for (const { batch, pendingVaccines } of ownerBatches) {
            const hasOverdue = pendingVaccines.some((vaccine) => vaccine.status === 'overdue');
            const type = hasOverdue ? 'vaccination_overdue' : 'vaccination_reminder';
            const title = hasOverdue ? '⚠️ Vaccination Overdue' : '💉 Vaccination Due';
            const batchName = displayNames.get(String(batch.id)) || 'Your batch';
            const details = pendingVaccines.slice(0, 5).map((vaccine) => vaccine.status === 'overdue'
                ? `${vaccine.name} (Day ${vaccine.scheduledDay}) overdue by ${vaccine.overdueDays} day${vaccine.overdueDays === 1 ? '' : 's'}`
                : `${vaccine.name} due today (Day ${vaccine.scheduledDay})`).join('; ');
            const body = `${batchName}: ${details}${pendingVaccines.length > 5 ? `; and ${pendingVaccines.length - 5} more scheduled dose${pendingVaccines.length - 5 === 1 ? '' : 's'}` : ''}.`;
            const inserted = await createNotificationOnce({
                ownerId,
                title,
                message: body,
                type,
                dedupeKey: `vaccination_schedule:${batch.id}:${today}`,
            });
            if (!inserted) continue;
            await sendPushNotification(ownerId, preferences, {
                type,
                title,
                body,
                batchId: String(batch.id),
            });
            console.log(JSON.stringify({ event: 'scheduled_vaccination_notification_created', ownerId, batchId: batch.id, date: today, status: hasOverdue ? 'overdue' : 'due' }));
        }
    }
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