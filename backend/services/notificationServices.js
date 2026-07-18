import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';

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

// ----- Vaccination reminders (due + overdue) -----
export const sendVaccinationReminders = async () => {
    const today = new Date().toISOString().split('T')[0];

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

    if (dueError) {
        console.error('❌ Error fetching due vaccinations:', dueError);
        return;
    }

    // 2. Fetch overdue vaccinations (next_due_date < today)
    // Also send reminders for records already marked 'Overdue' (e.g., once a week)
const { data: alreadyOverdue } = await supabase
    .from('vaccination_records')
    .select(`
        id,
        vaccine_name,
        next_due_date,
        pig_batches ( batch_code, owner_id )
    `)
    .eq('status', 'Overdue')
    .gt('next_due_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // only within last week
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
        const { data: devices } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        const tokens = devices.map(d => d.fcm_token);
        if (tokens.length === 0) continue;

        // Due notifications
        if (due.length > 0) {
            const batchNames = due.map(v => v.pig_batches?.batch_code || 'Unknown').join(', ');
            const vaccineNames = due.map(v => v.vaccine_name).join(', ');
            const title = '💉 Vaccination Due';
            const body = `Vaccination(s) due today for ${batchNames}: ${vaccineNames}`;
            await supabase.from('notifications').insert([{
                title,
                message: body,
                type: 'vaccination_reminder',
                user_id: ownerId,
            }]);
            const sendPromises = tokens.map(token =>
                admin.messaging().send({
                    token,
                    notification: { title, body },
                    data: { type: 'vaccination_reminder' },
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
            await supabase.from('notifications').insert([{
                title,
                message: body,
                type: 'vaccination_overdue',
                user_id: ownerId,
            }]);
            const sendPromises = tokens.map(token =>
                admin.messaging().send({
                    token,
                    notification: { title, body },
                    data: { type: 'vaccination_overdue' },
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