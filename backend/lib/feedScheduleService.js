import { FEED_PROGRAM, mapRationToFeedType } from './feedProgram.js';

// ============================================
// CORE FEED SCHEDULE COMPUTATIONS
// ============================================

const BAG_WEIGHT_KG = 50;

/**
 * Calculate weeks since batch was acquired
 * Week 1 = day 0-6 after acquisition
 * @param {string|Date} dateAcquired - ISO date string or Date object
 * @returns {number} Week number (1-26, clamped)
 */
export function getBatchAgeWeeks(dateAcquired) {
  const acquired = new Date(dateAcquired);
  const now = new Date();
  const diffMs = now - acquired;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(26, weeks));
}

/**
 * Get current feed program for a batch based on its age
 * @param {Object} batch - Batch object with date_acquired
 * @returns {Object} Current feed program with computed values
 */
export function getCurrentFeedProgram(batch) {
  if (!batch || !batch.date_acquired) return null;

  const weeksSinceAcquired = getBatchAgeWeeks(batch.date_acquired);
  const pigCount = batch.pig_count || 0;
  const program = FEED_PROGRAM.find(p => p.week === weeksSinceAcquired);

  if (!program) return null;

  const feedType = mapRationToFeedType(program.ration);
  const totalWeeklyKg = program.weeklyFC * pigCount;
  const totalDailyKg = program.dailyFC * pigCount;
  const bagsNeeded = Math.ceil(totalWeeklyKg / BAG_WEIGHT_KG);

  return {
    week: weeksSinceAcquired,
    ration: program.ration,
    phase: program.phase,
    dailyFC: program.dailyFC,
    weeklyFC: program.weeklyFC,
    feedType,
    dailyPerPigKg: program.dailyFC,
    weeklyPerPigKg: program.weeklyFC,
    totalDailyKg: Math.round(totalDailyKg * 100) / 100,
    totalWeeklyKg: Math.round(totalWeeklyKg * 100) / 100,
    bagsPerPig: program.bagsPerPig || (program.weeklyFC / BAG_WEIGHT_KG),
    bagsNeeded,
    referencePricePerBag: program.referencePricePerBag || null,
    isOverride: false
  };
}

/**
 * Get next feed change for a batch
 * @param {Object} batch - Batch object with date_acquired
 * @returns {Object|null} Next feed change details or null if complete
 */
export function getNextFeedChange(batch) {
  if (!batch || !batch.date_acquired) return null;

  const currentWeek = getBatchAgeWeeks(batch.date_acquired);
  const acquiredDate = new Date(batch.date_acquired);

  // Find next week where ration or phase changes
  for (let w = currentWeek + 1; w <= 26; w++) {
    const currentProgram = FEED_PROGRAM.find(p => p.week === currentWeek);
    const nextProgram = FEED_PROGRAM.find(p => p.week === w);

    if (!nextProgram) break;

    if (nextProgram.ration !== currentProgram.ration || nextProgram.phase !== currentProgram.phase) {
      const changeDate = new Date(acquiredDate.getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000);
      const daysUntil = Math.ceil((changeDate - new Date()) / (1000 * 60 * 60 * 24));

      return {
        week: w,
        date: changeDate.toISOString().split('T')[0],
        fromRation: currentProgram.ration,
        toRation: nextProgram.ration,
        fromPhase: currentProgram.phase,
        toPhase: nextProgram.phase,
        fromFeedType: mapRationToFeedType(currentProgram.ration),
        toFeedType: mapRationToFeedType(nextProgram.ration),
        daysUntil: Math.max(0, daysUntil),
        isOverdue: daysUntil < 0
      };
    }
  }

  return null; // No more changes (past week 26)
}

/**
 * Get all feed changes for a batch
 * @param {Object} batch - Batch object with date_acquired
 * @returns {Array} All feed changes with dates
 */
export function getAllFeedChanges(batch) {
  if (!batch || !batch.date_acquired) return [];

  const acquiredDate = new Date(batch.date_acquired);
  const changes = [];

  for (let w = 2; w <= 26; w++) {
    const prevProgram = FEED_PROGRAM.find(p => p.week === w - 1);
    const currentProgram = FEED_PROGRAM.find(p => p.week === w);

    if (!currentProgram) break;

    if (currentProgram.ration !== prevProgram.ration || currentProgram.phase !== prevProgram.phase) {
      const changeDate = new Date(FEED_PROGRAM[0].week === 1 ? 
        new Date(batch.date_acquired).getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000 :
        new Date(batch.date_acquired).getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000);
      
      const now = new Date();
      const daysUntil = Math.ceil((new Date(changeDate) - now) / (1000 * 60 * 60 * 24));

      changes.push({
        week: w,
        date: changeDate.toISOString().split('T')[0],
        fromRation: prevProgram.ration,
        toRation: currentProgram.ration,
        fromPhase: prevProgram.phase,
        toPhase: currentProgram.phase,
        fromFeedType: mapRationToFeedType(prevProgram.ration),
        toFeedType: mapRationToFeedType(currentProgram.ration),
        daysUntil: Math.max(-999, daysUntil), // Allow negative for past
        isPast: daysUntil < 0,
        isToday: daysUntil === 0,
        isSoon: daysUntil > 0 && daysUntil <= 3
      });
    }
  }

  return changes;
}

/**
 * Check if feed change is due today or overdue
 * @param {Object} batch - Batch object
 * @returns {boolean}
 */
export function isFeedChangeDue(batch) {
  const nextChange = getNextFeedChange(batch);
  return nextChange && nextChange.daysUntil <= 0;
}

/**
 * Check if feed change is coming soon
 * @param {Object} batch - Batch object
 * @param {number} days - Days threshold (default 3)
 * @returns {boolean}
 */
export function isFeedChangeSoon(batch, days = 3) {
  const nextChange = getNextFeedChange(batch);
  return nextChange && nextChange.daysUntil > 0 && nextChange.daysUntil <= days;
}

/**
 * Get feed change history with past and upcoming
 * @param {Object} batch - Batch object
 * @returns {Object} Past and upcoming changes
 */
export function getFeedChangeHistory(batch) {
  const allChanges = getAllFeedChanges(batch);
  const now = new Date();

  return {
    past: allChanges.filter(c => c.isPast),
    today: allChanges.filter(c => c.isToday),
    upcoming: allChanges.filter(c => !c.isPast && !c.isToday),
    nextChange: allChanges.find(c => !c.isPast) || null
  };
}

/**
 * Validate if provided feed type matches expected for batch
 * @param {Object} batch - Batch object
 * @param {string} feedType - Provided feed type (e.g., "Starter Mash")
 * @returns {Object} Validation result
 */
export function validateFeedRation(batch, feedType) {
  const currentFeed = getCurrentFeedProgram(batch);
  
  if (!currentFeed) {
    return {
      valid: true,
      expected: null,
      message: 'Unable to determine expected feed type',
      allowOverride: true,
      expectedRation: null,
      expectedFeedType: null,
      currentWeek: null
    };
  }

  const expectedFeedType = currentFeed.feedType;
  const isValid = feedType && feedType.toLowerCase() === expectedFeedType.toLowerCase();

  return {
    valid: isValid,
    expected: expectedFeedType,
    provided: feedType,
    expectedRation: currentFeed.ration,
    expectedFeedType,
    currentWeek: currentFeed.week,
    currentPhase: currentFeed.phase,
    message: isValid 
      ? `Correct feed type for Week ${currentFeed.week} (${currentFeed.phase})`
      : `Batch is in Week ${currentFeed.week} (${currentFeed.phase}). Expected: ${expectedFeedType} (${currentFeed.ration}). Provided: ${feedType || 'none'}.`,
    allowOverride: true
  };
}

/**
 * Get feed schedule status for display
 * @param {Object} batch - Batch object
 * @returns {Object} Status summary
 */
export function getFeedScheduleStatus(batch) {
  const currentFeed = getCurrentFeedProgram(batch);
  const nextChange = getNextFeedChange(batch);
  const allChanges = getAllFeedChanges(batch);

  if (!currentFeed) {
    return {
      status: 'unknown',
      message: 'Unable to determine feed schedule'
    };
  }

  if (currentFeed.week >= 26 && !getNextFeedChange(batch)) {
    return {
      status: 'complete',
      message: 'Feed program complete (Week 26+)',
      currentFeed,
      nextChange: null
    };
  }

  if (isFeedChangeDue(batch)) {
    return {
      status: 'overdue',
      message: `Feed change overdue! Should be ${nextChange.toFeedType} (${nextChange.toPhase})`,
      currentFeed,
      nextChange,
      daysUntil: 0
    };
  }

  if (isFeedChangeSoon(batch, 3)) {
    return {
      status: 'soon',
      message: `Feed changes to ${nextChange.toFeedType} (${nextChange.toPhase}) in ${nextChange.daysUntil} day${nextChange.daysUntil !== 1 ? 's' : ''}`,
      currentFeed,
      nextChange,
      daysUntil: nextChange.daysUntil
    };
  }

  return {
    status: 'ok',
    message: `Current: ${currentFeed.feedType} (Week ${currentFeed.week})`,
    currentFeed,
    nextChange,
    daysUntil: nextChange?.daysUntil
  };
}

/**
 * Get complete feed schedule with validation
 * @param {Object} batch - Batch object
 * @returns {Object} Complete schedule for display
 */
export function getCompleteFeedSchedule(batch) {
  const currentFeed = getCurrentFeedProgram(batch);
  const nextChange = getNextFeedChange(batch);
  const allChanges = getAllFeedChanges(batch);
  const status = getFeedScheduleStatus(batch);

  return {
    batchId: batch?.id,
    currentWeek: currentFeed?.week || 1,
    currentFeed,
    nextChange,
    allChanges,
    status,
    totalWeeks: 26,
    isComplete: currentFeed?.week >= 26 && !getNextFeedChange(batch)
  };
}

/**
 * Get expected feed type for a batch at a specific week
 * @param {Object} batch - Batch object
 * @param {number} week - Week number (1-26)
 * @returns {Object} Expected feed for that week
 */
export function getFeedForWeek(batch, week) {
  const clampedWeek = Math.max(1, Math.min(26, week));
  const program = FEED_PROGRAM.find(p => p.week === clampedWeek);
  
  if (!program) return null;

  return {
    week: clampedWeek,
    ration: program.ration,
    phase: program.phase,
    dailyFC: program.dailyFC,
    weeklyFC: program.weeklyFC,
    feedType: mapRationToFeedType(program.ration),
    dailyPerPigKg: program.dailyFC,
    weeklyPerPigKg: program.weeklyFC,
    bagsPerPig: program.bagsPerPig || (program.weeklyFC / BAG_WEIGHT_KG)
  };
}

/**
 * Get batch age in days
 * @param {string|Date} dateAcquired
 * @returns {number} Days since acquired
 */
export function getBatchAgeDays(dateAcquired) {
  const acquired = new Date(dateAcquired);
  const now = new Date();
  return Math.floor((now - acquired) / (1000 * 60 * 60 * 24));
}

/**
 * Get week start and end dates for a batch
 * @param {Object} batch - Batch object
 * @param {number} week - Week number
 * @returns {Object} Week start and end dates
 */
export function getWeekDateRange(batch, week) {
  const acquired = new Date(batch.date_acquired);
  const startDate = new Date(acquired.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  return {
    week,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}