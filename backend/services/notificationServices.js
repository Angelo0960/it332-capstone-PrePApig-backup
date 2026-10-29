import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';

async function preferencesFor(userId) {
    const { data, error } = await supabase.from('notification_preferences').select('feed_reminders,vaccination_reminders,push_enabled').eq('user_id', userId).maybeSingle();
    if (error) throw new Error('Unable to read notification preferences');
    return data || { feed_reminders: true, vaccination_reminders: true, push_enabled: true };
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

const parseFeedingTimeMinutes = (value) => {
    if (!value) return null;
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3]?.toUpperCase();
    if (minute > 59) return null;
    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        if (meridiem === 'PM' && hour !== 12) hour += 12;
        if (meridiem === 'AM' && hour === 12) hour = 0;
    } else if (hour > 23) {
        return null;
    }
    return hour * 60 + minute;
};

/**
 * Send daily feed reminders and overdue vaccination alerts.
 * Runs via cron job.
 */

// ----- Feed reminders (time-aware) -----
export const sendDailyFeedReminders = async () => {
    const { date: today, minutes: currentMinutes } = getDateTimeInTimezone();

    console.log(`🔍 Checking feed records for ${today} at minute ${currentMinutes}...`);

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

    if (error) throw error;

    const pendingRecords = (records || []).filter((record) => {
        const scheduledMinutes = parseFeedingTimeMinutes(record.feeding_time);
        return scheduledMinutes === null || scheduledMinutes <= currentMinutes;
    });

    if (pendingRecords.length === 0) {
        console.log('✅ No feedings due at the current time.');
        return;
    }

    console.log(`📋 Found ${pendingRecords.length} feedings due now.`);

    const userMap = new Map();
    for (const rec of pendingRecords) {
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
        const preferences = await preferencesFor(ownerId);
        if (!preferences.feed_reminders) continue;
        const { data: devices, error: tokenError } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        if (tokenError) {
            console.error(`❌ Error fetching tokens for user ${ownerId}:`, tokenError);
            continue;
        }

        const tokens = preferences.push_enabled ? [...new Set((devices || []).map(d => d.fcm_token).filter(Boolean))] : [];

        const batchCodes = [...new Set(userRecords.map(r => r.pig_batches?.batch_code || 'Unknown'))];
        const totalKg = userRecords.reduce((sum, r) => sum + Number(r.quantity_kg), 0);
        const title = `🐖 Daily Feed Reminder`;
        const body = `You have ${userRecords.length} feeding(s) today for: ${batchCodes.join(', ')}. Total: ${totalKg} kg.`;

        await supabase.from('notifications').upsert([{
            title,
            message: body,
            type: 'feed_reminder',
            user_id: ownerId,
            dedupe_key: `feed_reminder:${today}`,
        }], { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });

        const sendResults = await Promise.all(tokens.map(token =>
            admin.messaging().send({
                token,
                data: { type: 'feed_reminder', title, body },
            }).then((result) => ({ sent: !result?.skipped, token }))
              .catch(async err => {
                  if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
                      await supabase.from('user_devices').delete().eq('fcm_token', token);
                  }
                  console.error(JSON.stringify({ event: 'scheduled_feed_delivery_failed', ownerId, code: err.code || 'unknown' }));
                  return { sent: false, token };
              })
        ));

        const sentCount = sendResults.filter((result) => result.sent).length;
        if (sentCount > 0) {
            const recordIds = userRecords.map((record) => record.id);
            await supabase.from('feed_records').update({ reminder_sent: true }).in('id', recordIds);
            console.log(`✅ Sent ${sentCount} feed reminder(s) to user ${ownerId}`);
        } else {
            console.warn(`⚠️ No feed reminder delivered to user ${ownerId}; records remain pending.`);
        }
    }
};

// ----- Vaccination reminders (due + overdue) -----
export const sendVaccinationReminders = async () => {
    const { date: today } = getDateTimeInTimezone();

    console.log(`🔍 Checking vaccinations due or overdue for ${today}...`);

    // 1. Fetch due vaccinations (next_due_date = today)
    const { data: dueVaccinations, error: dueError } = await supabase
        .from('vaccination_records')
        .select(`
            id,
            vaccine_name,
            next_due_date,
            pig_batches (
                batch_code,
                owner_id
            )
        `)
        .eq('next_due_date', today)
        .eq('status', 'Scheduled');

    if (dueError) throw dueError;

    // 2. Fetch every scheduled/overdue vaccination whose due date has passed.
    // Scheduled records must be included so they can transition to Overdue.
    const { data: alreadyOverdue, error: overdueError } = await supabase
        .from('vaccination_records')
        .select(`
        id,
        vaccine_name,
        next_due_date,
        pig_batches ( batch_code, owner_id )
    `)
        .lt('next_due_date', today)
        .in('status', ['Scheduled', 'Overdue']);
    if (overdueError) throw overdueError;
    const overdueVaccinations = alreadyOverdue || [];
    // Update overdue records status to 'Overdue'
    if (overdueVaccinations.length > 0) {
        const overdueIds = overdueVaccinations.map(v => v.id);
        await supabase
            .from('vaccination_records')
            .update({ status: 'Overdue' })
            .in('id', overdueIds);
    }

    const allVaccinations = [...dueVaccinations, ...overdueVaccinations];
    if (allVaccinations.length === 0) {
        console.log('✅ No vaccinations due or overdue today.');
        return;
    }

    console.log(`📋 Found ${allVaccinations.length} vaccinations (${dueVaccinations.length} due, ${overdueVaccinations.length} overdue).`);

    const userMap = new Map();
    for (const vac of allVaccinations) {
        const ownerId = vac.pig_batches?.owner_id;
        if (!ownerId) continue;
        if (!userMap.has(ownerId)) userMap.set(ownerId, { due: [], overdue: [] });
        if (vac.next_due_date === today) {
            userMap.get(ownerId).due.push(vac);
        } else {
            userMap.get(ownerId).overdue.push(vac);
        }
    }

    for (const [ownerId, { due, overdue }] of userMap) {
        const preferences = await preferencesFor(ownerId);
        if (!preferences.vaccination_reminders) continue;
        const { data: devices } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        const tokens = preferences.push_enabled ? [...new Set((devices || []).map(d => d.fcm_token).filter(Boolean))] : [];


        // Due notifications
        if (due.length > 0) {
            const batchNames = due.map(v => v.pig_batches?.batch_code || 'Unknown').join(', ');
            const vaccineNames = due.map(v => v.vaccine_name).join(', ');
            const title = '💉 Vaccination Due';
            const body = `Vaccination(s) due today for ${batchNames}: ${vaccineNames}`;
            await supabase.from('notifications').upsert([{
                title,
                message: body,
                type: 'vaccination_reminder',
                user_id: ownerId,
                dedupe_key: `vaccination_due:${today}`,
            }], { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
            const sendPromises = tokens.map(token =>
                admin.messaging().send({
                    token,
                    data: { type: 'vaccination_reminder', title, body },
                }).catch(err => {
                    if (err.code === 'messaging/invalid-registration-token') {
                        supabase.from('user_devices').delete().eq('fcm_token', token);
                    }
                    return null;
                })
            );
            await Promise.allSettled(sendPromises);
            console.log(`✅ Sent due reminders to user ${ownerId}`);
        }

        // Overdue notifications
        if (overdue.length > 0) {
            const batchNames = overdue.map(v => v.pig_batches?.batch_code || 'Unknown').join(', ');
            const vaccineNames = overdue.map(v => v.vaccine_name).join(', ');
            // Calculate days overdue
            const daysOverdue = overdue.map(v => {
                const days = Math.floor((new Date() - new Date(v.next_due_date)) / (1000 * 60 * 60 * 24));
                return `${v.vaccine_name} (${days} day${days > 1 ? 's' : ''} overdue)`;
            }).join(', ');
            const title = '⚠️ Vaccination Overdue';
            const body = `Overdue vaccination(s) for ${batchNames}: ${daysOverdue}`;
            await supabase.from('notifications').upsert([{
                title,
                message: body,
                type: 'vaccination_overdue',
                user_id: ownerId,
                dedupe_key: `vaccination_overdue:${today}`,
            }], { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
            const sendPromises = tokens.map(token =>
                admin.messaging().send({
                    token,
                    data: { type: 'vaccination_overdue', title, body },
                }).catch(err => {
                    if (err.code === 'messaging/invalid-registration-token') {
                        supabase.from('user_devices').delete().eq('fcm_token', token);
                    }
                    return null;
                })
            );
            await Promise.allSettled(sendPromises);
            console.log(`✅ Sent overdue reminders to user ${ownerId}`);
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