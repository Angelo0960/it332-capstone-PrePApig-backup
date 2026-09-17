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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`🔍 Checking vaccinations due or overdue for ${today}...`);

    // 1. Fetch due vaccinations (next_due_date = today)
    const { data: dueVaccinations, error: dueError } = await supabase
        .from('vaccination_records')
        .select(`
            id,
            vaccine_name,
            next_due_date,
            pig_batches ( batch_code, owner_id )
        `)
        .eq('next_due_date', today)
        .eq('status', 'Scheduled');

    if (dueError) {
        console.error('❌ Error fetching due vaccinations:', dueError);
        return;
    }

    // 2. Fetch newly overdue vaccinations (next_due_date < today AND status = 'Scheduled')
    const { data: newlyOverdue, error: overdueError } = await supabase
        .from('vaccination_records')
        .select(`
            id,
            vaccine_name,
            next_due_date,
            pig_batches ( batch_code, owner_id )
        `)
        .lt('next_due_date', today)
        .eq('status', 'Scheduled');

    if (overdueError) {
        console.error('❌ Error fetching newly overdue vaccinations:', overdueError);
        return;
    }

    // 3. Update newly overdue records to status 'Overdue'
    if (newlyOverdue && newlyOverdue.length > 0) {
        const ids = newlyOverdue.map(v => v.id);
        await supabase
            .from('vaccination_records')
            .update({ status: 'Overdue' })
            .in('id', ids);
        console.log(`📌 Marked ${ids.length} records as Overdue`);
    }

    // 4. Fetch already-overdue records from the last 7 days (to send repeat reminders)
    const { data: alreadyOverdue, error: repeatError } = await supabase
        .from('vaccination_records')
        .select(`
            id,
            vaccine_name,
            next_due_date,
            pig_batches ( batch_code, owner_id )
        `)
        .eq('status', 'Overdue')
        .gte('next_due_date', sevenDaysAgo);   // only remind again if overdue within last week

    if (repeatError) {
        console.error('❌ Error fetching already-overdue vaccinations:', repeatError);
        return;
    }

    // Combine all three groups
    const allVaccinations = [
        ...(dueVaccinations || []),
        ...(newlyOverdue || []),
        ...(alreadyOverdue || [])
    ];

    if (allVaccinations.length === 0) {
        console.log('✅ No vaccinations due, newly overdue, or recently overdue.');
        return;
    }

    console.log(`📋 Found ${allVaccinations.length} vaccinations to remind.`);

    // Group by owner
    const userMap = new Map();
    for (const vac of allVaccinations) {
        const ownerId = vac.pig_batches?.owner_id;
        if (!ownerId || ownerId === 'admin') continue;
        if (!userMap.has(ownerId)) {
            userMap.set(ownerId, { due: [], newlyOverdue: [], alreadyOverdue: [] });
        }
        if (vac.next_due_date === today) {
            userMap.get(ownerId).due.push(vac);
        } else if (newlyOverdue.some(v => v.id === vac.id)) {
            userMap.get(ownerId).newlyOverdue.push(vac);
        } else {
            userMap.get(ownerId).alreadyOverdue.push(vac);
        }
    }

    // Send notifications per owner
    for (const [ownerId, { due, newlyOverdue, alreadyOverdue }] of userMap) {
        const { data: devices } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        const tokens = devices?.map(d => d.fcm_token).filter(Boolean) || [];
        if (tokens.length === 0) continue;

        // Helper to send push + DB notification
        const sendNotification = async (title, body, type, records) => {
            // Save in DB
            await supabase.from('notifications').insert([{
                user_id: ownerId,
                title,
                message: body,
                type,
                is_read: false,
            }]);

            // Send push
            const promises = tokens.map(token =>
                admin.messaging().send({
                    token,
                    notification: { title, body },
                    data: { type },
                }).catch(err => {
                    if (err.code === 'messaging/invalid-registration-token') {
                        supabase.from('user_devices').delete().eq('fcm_token', token);
                    }
                    return null;
                })
            );
            await Promise.allSettled(promises);
            console.log(`✅ Sent ${type} to user ${ownerId}`);
        };

        // Due notifications
        if (due.length > 0) {
            const batchNames = [...new Set(due.map(v => v.pig_batches?.batch_code || 'Unknown'))].join(', ');
            const vaccineNames = due.map(v => v.vaccine_name).join(', ');
            await sendNotification(
                '💉 Vaccination Due',
                `Vaccination(s) due today for ${batchNames}: ${vaccineNames}`,
                'vaccination_reminder',
                due
            );
        }

        // Newly overdue
        if (newlyOverdue.length > 0) {
            const batchNames = [...new Set(newlyOverdue.map(v => v.pig_batches?.batch_code || 'Unknown'))].join(', ');
            const details = newlyOverdue.map(v => {
                const days = Math.floor((new Date() - new Date(v.next_due_date)) / (1000 * 60 * 60 * 24));
                return `${v.vaccine_name} (${days} day${days > 1 ? 's' : ''} overdue)`;
            }).join(', ');
            await sendNotification(
                '⚠️ Vaccination Overdue',
                `Overdue vaccination(s) for ${batchNames}: ${details}`,
                'vaccination_overdue',
                newlyOverdue
            );
        }

        // Repeat reminders for already-overdue (within last week)
        if (alreadyOverdue.length > 0) {
            const batchNames = [...new Set(alreadyOverdue.map(v => v.pig_batches?.batch_code || 'Unknown'))].join(', ');
            const details = alreadyOverdue.map(v => {
                const days = Math.floor((new Date() - new Date(v.next_due_date)) / (1000 * 60 * 60 * 24));
                return `${v.vaccine_name} (${days} day${days > 1 ? 's' : ''} overdue)`;
            }).join(', ');
            await sendNotification(
                '⚠️ Vaccination Still Overdue',
                `Reminder: overdue vaccination(s) for ${batchNames}: ${details}`,
                'vaccination_overdue_repeat',
                alreadyOverdue
            );
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

// ============================================
// FEED CHANGE NOTIFICATIONS
// ============================================

import { 
  getNextFeedChange, 
  isFeedChangeDue, 
  isFeedChangeSoon,
  getCurrentFeedProgram,
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
        .select('id, batch_code, date_acquired, owner_id, pig_count, breed')
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
        if (tokens.length === 0) continue;

        // Check if feed change is due or coming soon
        const isDue = isFeedChangeDue(batch);
        const isSoon = isFeedChangeSoon(batch, 3);
        const nextChange = getNextFeedChange(batch);
        const currentFeed = getCurrentFeedProgram(batch);

        if (!nextChange) continue; // No more changes

        let notificationType = null;
        let title = '';
        let body = '';
        let notificationData = {
            type: 'feed_change',
            batchId: batch.id,
            batchCode: batch.batch_code
        };

        // Check if we already sent a notification for this change today
        const today = new Date().toISOString().split('T')[0];
        const { data: existingNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', batch.owner_id)
            .eq('type', 'feed_change')
            .gte('created_at', `${today}T00:00:00`)
            .lte('created_at', `${today}T23:59:59`)
            .maybeSingle();

        if (existingNotif) {
            // Already sent notification for this batch today
            continue;
        }

        if (isFeedChangeDue(batch)) {
            notificationType = 'feed_change_due';
            title = '🔄 Feed Change Due Today';
            body = `Batch ${batch.batch_code} should transition from ${nextChange.fromFeedType} (${nextChange.fromPhase}) to ${nextChange.toFeedType} (${nextChange.toPhase}) today.`;
            notificationData = {
                ...notificationData,
                changeType: 'due',
                fromFeedType: nextChange.fromFeedType,
                toFeedType: nextChange.toFeedType,
                fromPhase: nextChange.fromPhase,
                toPhase: nextChange.toPhase,
                changeDate: nextChange.date
            };
        } else if (isFeedChangeSoon(batch, 3)) {
            notificationType = 'feed_change_upcoming';
            title = '⏰ Feed Change Coming Soon';
            body = `Batch ${batch.batch_code} will change from ${nextChange.fromFeedType} (${nextChange.fromPhase}) to ${nextChange.toFeedType} (${nextChange.toPhase}) in ${nextChange.daysUntil} day${nextChange.daysUntil !== 1 ? 's' : ''}.`;
            notificationData = {
                ...notificationData,
                changeType: 'upcoming',
                fromFeedType: nextChange.fromFeedType,
                toFeedType: nextChange.toFeedType,
                fromPhase: nextChange.fromPhase,
                toPhase: nextChange.toPhase,
                changeDate: nextChange.date,
                daysUntil: nextChange.daysUntil
            };
        } else {
            continue; // No notification needed
        }

        // Save notification in database
        await supabase
            .from('notifications')
            .insert([{
                user_id: batch.owner_id,
                title,
                message: body,
                type: notificationType,
                is_read: false,
            }]);

        // Send push notification
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