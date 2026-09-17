# PrepAPig - FCR & Auto Weight Gain Implementation Plan

## Overview

This document outlines the implementation plan for **Phase 1: FCR Service & Automatic Weight Gain from Feed Records**. This is the foundational layer that enables all advanced analytics (growth forecasting, feed cost projection, profit analysis, AI insights).

---

## Current State

- **Feed recording works**: `POST /feeds/create` logs feed records
- **Weight tracking is manual**: `PATCH /pigs/:id/weight` updates `current_weight` on batch
- **No FCR logic exists**: Feed records don't affect weight
- **No weight history**: Only current weight stored, no time-series

---

## Phase 1 Goals

1. **Calculate FCR** from historical feed + weight data
2. **Auto-update batch weight** when feed is logged (using FCR)
3. **Track weight history** for time-series analysis
4. **Validate feed rations** against feed program schedule

---

## Technical Design

### 1. Database Changes

```sql
-- Add weight history tracking to pig_batches
ALTER TABLE pig_batches ADD COLUMN weight_history JSONB DEFAULT '[]'::jsonb;
-- Structure: [{date: "2026-09-15", weight: 45.5, source: "manual|auto_feed", notes: "..."}]

-- Add FCR tracking
ALTER TABLE pig_batches ADD COLUMN current_fcr DECIMAL(5,2);
ALTER TABLE pig_batches ADD COLUMN fcr_source VARCHAR(20) DEFAULT 'default'; -- 'default' | 'calculated' | 'manual'

-- Index for weight history queries
CREATE INDEX idx_pig_batches_weight_history ON pig_batches USING GIN (weight_history);
```

### 2. New Service: `backend/lib/fcrService.js`

```javascript
// Core FCR calculation
export function calculateFCR(feedRecords, weightHistory) {
  // Formula: totalFeedKg / totalWeightGainKg
  // Returns { fcr, confidence, dataPoints }
}

// Auto weight gain from feed
export function calculateWeightGain(feedKg, fcr) {
  // weightGainKg = feedKg / fcr
  // Returns weightGainKg
}

// Get effective FCR for batch
export function getEffectiveFCR(batch) {
  // Priority: batch.current_fcr > calculatedFCR > defaultFCR(phase)
}
```

### 3. Feed Program Default FCRs (from research)

| Phase | Weeks | Ration | Default FCR | Daily Feed (kg/pig) | Expected ADG |
|-------|-------|--------|-------------|---------------------|--------------|
| Starter | 1-4 | Tmpbcs | 2.0 | 0.04-0.10 | 0.30-0.50 |
| Grower | 5-10 | HGPSM | 2.8 | 0.30-1.20 | 0.60-0.85 |
| Finisher 1 | 11-15 | HS-Premium | 2.5 | 1.30-1.80 | 0.75-0.90 |
| Finisher 2 | 16-26 | HG-Premium | 2.5 | 1.90-2.50 | 0.85-1.00 |

*Sources: Cambridge (687 pigs), Brazil 683 batches, Iowa State 4,472 pigs*

---

## Implementation Details

### 1. Backend Changes

#### `backend/lib/fcrService.js` (NEW)
```javascript
// Core functions:
// - calculateFCR(feedRecords, weightHistory)
// - calculateWeightGain(feedKg, fcr)
// - getEffectiveFCR(batch)
// - getPhaseFCR(phase)
// - updateBatchWeightFromFeed(batchId, feedKg, fcr)
```

#### `backend/lib/feedScheduleService.js` (ENHANCE)
- Add `validateFeedRation()` - already exists
- Add `getPhaseFCR()` - returns default FCR for current phase

#### `backend/controllers/feedController.js` (MODIFY)
```javascript
// In createFeedRecord():
// 1. Save feed record
// 2. Get batch
// 2. Calculate weight gain: feedKg / effectiveFCR
// 3. Update batch: current_weight += weightGain
// 4. Append to weight_history
// 4. Return validation + new weight in response
```

#### `backend/controllers/pigController.js` (MODIFY)
```javascript
// Add endpoints:
// GET /pigs/:id/weight-history - returns weight_history array
// POST /pigs/:id/weight-log - manual weight entry (appends to history)
// GET /pigs/:id/fcr - returns current FCR, history, confidence
```

#### `backend/routes/pigRoutes.js` (MODIFY)
- Add new routes for weight history and FCR

### 2. Frontend Changes

#### `frontend/src/api.js`
```javascript
export const weightApi = {
  async getWeightHistory(batchId) { ... },
  async logWeight(batchId, weight, notes) { ... },
  async getFCR(batchId) { ... }
};
```

#### `frontend/src/pages/DashboardScreen.jsx`
- Show current FCR badge on batch cards
- Display weight trend sparkline

#### `frontend/src/pages/FeedsInventoryScreen.jsx`
- Show expected weight gain when logging feed
- Display "Expected gain: X kg" based on feed amount + FCR

#### `frontend/src/pages/AnalyticsReportScreen.jsx`
- Add FCR trend chart
- Show FCR vs target benchmark

---

## API Contracts

### POST `/pigs/:id/weight-log`
```json
// Request
{ "weight": 45.5, "notes": "Weekly weigh-in", "source": "manual" }

// Response
{
  "success": true,
  "data": {
    "batch_id": "uuid",
    "new_weight": 45.5,
    "weight_gain": 2.3,
    "fcr": 2.65
  }
}
```

### GET `/pigs/:id/weight-history`
```json
// Response
{
  "success": true,
  "data": [
    { "date": "2026-09-01", "weight": 40.0, "source": "manual" },
    { "date": "2026-09-08", "weight": 43.2, "source": "auto_feed" },
    { "date": "2026-09-15", "weight": 45.5, "source": "manual" }
  ]
}
```

### GET `/pigs/:id/fcr`
```json
{
  "success": true,
  "data": {
    "current_fcr": 2.65,
    "fcr_source": "calculated",
    "confidence": "high",
    "data_points": 12,
    "phase": "Grower",
    "target_fcr": 2.8,
    "trend": "improving",
    "history": [
      { "week": 1, "fcr": 2.1 },
      { "week": 2, "fcr": 2.3 },
      { "week": 3, "fcr": 2.5 }
    ]
  }
}
```

---

## Feed-Weight Integration Flow

```
User logs feed (POST /feeds/create)
       │
       ▼
Validate ration against feed program
       │
       ▼
Get batch's effective FCR
       │
       ▼
Calculate weight gain: feedKg / FCR
       │
       ▼
Update batch.current_weight += weightGain
       │
       ▼
Append to weight_history (source: "auto_feed")
       │
       ▼
Return response with validation + new weight
```

---

## Validation Rules

| Scenario | Behavior |
|----------|----------|
| Feed type matches expected ration | ✅ Allow, auto weight gain |
| Feed type mismatch (wrong phase) | ⚠️ Warn, allow with override |
| No FCR history (new batch) | Use phase default FCR |
| FCR calculated from history | Use calculated FCR (confidence: high/medium/low) |
| Manual weight entry | Source = "manual", doesn't affect FCR calc |

---

## Testing Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| New batch (Week 1), log 7kg Tmpbcs | Weight += 3.5kg (FCR 2.0) |
| Week 5 batch, log 52.5kg HGPSM | Weight += 18.75kg (FCR 2.8) |
| Log Grower Pellet in Starter phase | Warning, allow override |
| Manual weight entry | Updates weight, adds to history, no FCR change |
| FCR calculation from history | Uses total feed / total gain since acquisition |

---

## Rollout Plan

| Step | Action |
|------|--------|
| 1 | Run DB migration |
| 2 | Deploy `fcrService.js` |
| 3 | Update `feedController.js` |
| 3 | Update `pigController.js` + routes |
| 4 | Deploy frontend API + components |
| 5 | Test with existing batch (BATCH-825389) |
| 4 | Monitor FCR calculations for 1 week |
| 5 | Enable for all users |

---

## Future Phases (Post-Phase 1)

| Phase | Features |
|------|----------|
| **Phase 2** | Forecast endpoints (days to market, feed needs, cost, profitability) |
| **Phase 3** | AI narrative insights (Gemini) |
| **Phase 4** | Days to market widget, FCR trend chart, optimal sell date |

---

## Approval Required

- [ ] DB migration reviewed
- [ ] FCR default values approved
- [ ] Feed program FCR values approved
- [ ] Override behavior confirmed (warn vs block)
- [ ] Notification preferences for feed changes

---

**Document Version**: 1.0  
**Created**: 2026-09-15  
**Status**: Planning - Not Implemented