# PrePApig Forecasting Feature Plan

## Overview
This document outlines the forecasting capabilities planned for PrePApig, a pig farming management system. The goal is to provide actionable predictions for farmers to optimize feed purchasing, selling timing, and overall profitability.

---

## Available Historical Data

| Data Source | Temporal Fields | Key Metrics | Forecasting Potential |
|-------------|----------------|-------------|----------------------|
| **Individual Pigs** | `created_at`, `updated_at` | `weight`, `health_status` | Weight growth curves, FCR |
| **Pig Batches** | `date_acquired`, `created_at` | `start_weight`, `current_weight`, `pig_count`, `breed` | Days to market, batch performance |
| **Feed Records** | `feeding_date` | `quantity_kg`, `feed_type`, `batch_id` | Daily feed consumption, feed cost projection |
| **Expenses** | `expense_date` | `amount`, `expense_type`, `batch_id` | Cost trends, budget forecasting |
| **Market Prices** | `checked_at`, `reported_date` | `price_min`, `price_max`, `confidence` | Optimal sell timing, revenue projection |
| **Vaccinations** | `vaccination_date`, `next_due_date` | `vaccine_name`, `status` | Already has scheduling |

---

## Phase 1: Core Growth & Cost Forecasting (High Impact, Low Complexity)

### 1.1 Days to Market Weight
**Goal**: Predict when a batch reaches target market weight (90-100kg)

**Data Used**: 
- Batch weight history (`current_weight` updates over time)
- Breed information
- Daily weight gain rate

**Method**: Linear regression on weight gain rate
```javascript
// Formula: days_to_market = (target_weight - current_weight) / daily_gain_rate
// daily_gain_rate = (current_weight - start_weight) / days_since_acquired
```

**API Endpoint**: `GET /api/forecast/batch/:id/days-to-market`

**Response**:
```json
{
  "batch_id": "uuid",
  "current_weight": 45,
  "target_weight": 95,
  "daily_gain_rate": 0.62,
  "estimated_days_to_market": 81,
  "estimated_market_date": "2026-11-27",
  "confidence": "Moderate"
}
```

---

### 1.2 Feed Consumption Forecast
**Goal**: Project feed needs for next 30/60/90 days

**Data Used**: Daily feed records per batch (`quantity_kg`, `feeding_date`)

**Method**: Moving average (7-day and 30-day) with trend adjustment

**API Endpoint**: `GET /api/forecast/batch/:id/feed-needs?days=30`

**Response**:
```json
{
  "batch_id": "uuid",
  "forecast_days": 30,
  "avg_daily_consumption_kg": 25.4,
  "projected_total_kg": 762,
  "by_feed_type": {
    "Starter": 150,
    "Grower": 400,
    "Finisher": 212
  },
  "confidence": "High"
}
```

---

### 1.3 Feed Cost Projection
**Goal**: Estimate future feed costs based on consumption forecast

**Data Used**: Feed forecast + current feed stock prices (`feed_stocks` table)

**Method**: Projected consumption × current unit prices

**API Endpoint**: `GET /api/forecast/batch/:id/feed-cost?days=30`

**Response**:
```json
{
  "batch_id": "uuid",
  "forecast_days": 30,
  "projected_cost_php": 18500,
  "breakdown": {
    "Starter": { "kg": 150, "unit_price": 28, "subtotal": 4200 },
    "Grower": { "kg": 400, "unit_price": 26, "subtotal": 10400 },
    "Finisher": { "kg": 212, "unit_price": 24, "subtotal": 5088 }
  }
}
```

---

### 1.4 Batch Profitability Projection
**Goal**: Project revenue minus costs to market date

**Data Used**: 
- Market price (cached, 6hr TTL)
- Feed cost projection
- Expense trends
- Days to market

**Method**: Scenario modeling (conservative, expected, optimistic)

**API Endpoint**: `GET /api/forecast/batch/:id/profitability`

**Response**:
```json
{
  "batch_id": "uuid",
  "estimated_market_date": "2026-11-27",
  "scenarios": {
    "conservative": {
      "market_price_php_kg": 175,
      "total_revenue": 166250,
      "total_feed_cost": 45000,
      "total_expenses": 12000,
      "net_profit": 109250,
      "profit_per_pig": 2185
    },
    "expected": {
      "market_price_php_kg": 190,
      "total_revenue": 180500,
      "total_feed_cost": 45000,
      "total_expenses": 12000,
      "net_profit": 123500,
      "profit_per_pig": 2470
    },
    "optimistic": {
      "market_price_php_kg": 210,
      "total_revenue": 199500,
      "total_feed_cost": 45000,
      "total_expenses": 12000,
      "net_profit": 142500,
      "profit_per_pig": 2850
    }
  }
}
```

---

## Phase 2: Advanced Analytics (Medium Impact)

### 2.1 FCR (Feed Conversion Ratio) Tracking
**Goal**: Track kg feed per kg weight gain for efficiency monitoring

**Formula**: FCR = Total Feed Consumed (kg) / Total Weight Gain (kg)

**API Endpoint**: `GET /api/analytics/batch/:id/fcr`

**Response**:
```json
{
  "batch_id": "uuid",
  "current_fcr": 2.85,
  "target_fcr": 2.7,
  "trend": "improving",
  "weekly_fcr": [
    { "week": 1, "fcr": 3.2 },
    { "week": 2, "fcr": 2.9 },
    { "week": 3, "fcr": 2.85 }
  ]
}
```

---

### 2.2 Optimal Sell Date Recommendation
**Goal**: Recommend best date to sell based on price trends + projected readiness

**Data Used**: Market price history + batch readiness projection

**Method**: 
1. Project weight readiness date
2. Analyze market price trend (7/30 day moving average)
3. Recommend sell window (ready date ± 14 days)

**API Endpoint**: `GET /api/forecast/market/optimal-sell-date?batch_id=:id`

---

### 2.3 Batch Performance Benchmarking
**Goal**: Compare current batch against historical batches

**Metrics**: 
- Average daily gain (ADG)
- FCR
- Mortality rate
- Cost per kg produced

**API Endpoint**: `GET /api/analytics/benchmark?breed=Landrace&season=dry`

---

## Phase 3: ML-Enhanced (Future)

| Feature | Description | Method |
|---------|-------------|--------|
| **Weight Growth Curve Modeling** | Non-linear growth curves (Gompertz, logistic) | Curve fitting per breed |
| **Disease Risk Scoring** | Health status + vaccination + environment | Classification model |
| **Price Forecasting** | Market price prediction | Time series on historical market data |

---

## Technical Implementation Options

### Option A: Pure Node.js (Recommended Start)
- **Libraries**: `simple-statistics`, `ml-regression` (linear), custom moving average
- **Pros**: Single runtime, deploys on Vercel free tier, no new infrastructure
- **Cons**: Limited to linear/statistical methods

### Option B: Python Microservice
- **Stack**: FastAPI + Prophet / XGBoost / Scikit-learn
- **Pros**: Production-grade forecasting, non-linear models, seasonality
- **Cons**: Separate deployment (Railway/Render/Fly.io), additional complexity

### Option C: Cloud AutoML
- **Services**: Vertex AI Forecast, AWS Forecast, Azure AutoML
- **Pros**: Managed, handles holidays/seasonality automatically
- **Cons**: Cost, vendor lock-in, data privacy

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Node.js/Express)               │
│  GET /api/forecast/batch/:id/days-to-market                 │
│  GET /api/forecast/batch/:id/feed-needs?days=30             │
│  GET /api/forecast/batch/:id/profitability                  │
│  GET /api/forecast/market/optimal-sell-date                 │
│  GET /api/analytics/batch/:id/fcr                           │
│  GET /api/analytics/benchmark                               │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Node.js     │ │  Python      │ │  Supabase    │
│  Simple      │ │  ML Service  │ │  RPC/Views   │
│  Linear      │ │  (Future)    │ │  (Pre-compute)│
│  Regression  │ │  Prophet/    │ │  Materialized │
│  Moving Avg  │ │  XGBoost     │ │  Views        │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## Database Views for Pre-computation (Supabase)

```sql
-- Materialized view for batch weight history
CREATE MATERIALIZED VIEW batch_weight_history AS
SELECT 
  pb.id as batch_id,
  pb.breed,
  pb.date_acquired,
  pb.start_weight,
  pb.current_weight,
  p.weight as pig_weight,
  p.updated_at as weight_recorded_at
FROM pig_batches pb
LEFT JOIN pigs p ON p.batch_id = pb.id;

-- Materialized view for daily feed consumption
CREATE MATERIALIZED VIEW daily_feed_consumption AS
SELECT 
  fr.batch_id,
  fr.feeding_date,
  fr.feed_type,
  SUM(fr.quantity_kg) as total_kg
FROM feed_records fr
GROUP BY fr.batch_id, fr.feeding_date, fr.feed_type;

-- Market price history (already cached in market_price_reports)
```

---

## Vercel Free Tier Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| 10s function timeout | Long ML inference fails | Use Node.js simple stats; offload heavy ML to Python service |
| No persistent processes | Can't run background ML training | Use GitHub Actions for scheduled model retraining |
| 100 GB-hrs/month | Limited compute | Pre-compute in Supabase, serve static predictions |
| Serverless = cold starts | First request latency | Warmup cron or accept latency |

---

## Implementation Priority

### Week 1-2: Phase 1 Core (Node.js)
- [ ] Create `forecastController.js` with 4 endpoints
- [ ] Add linear regression utility (`lib/forecastUtils.js`)
- [ ] Add forecast routes (`routes/forecastRoutes.js`)
- [ ] Integrate with existing cache invalidation
- [ ] Test with existing batch data

### Week 3: Phase 2 Analytics (Node.js)
- [ ] FCR calculation endpoint
- [ ] Batch benchmarking endpoint
- [ ] Optimal sell date logic (rule-based)

### Week 4+: Phase 3 ML (If Needed)
- [ ] Evaluate data volume for ML viability
- [ ] Deploy Python service if >50 completed batches
- [ ] Implement Prophet for feed consumption seasonality

---

## API Endpoint Summary

| Endpoint | Method | Description | Caching |
|----------|--------|-------------|---------|
| `/api/forecast/batch/:id/days-to-market` | GET | Days until target weight | 30 min |
| `/api/forecast/batch/:id/feed-needs` | GET | Feed projection (30/60/90 days) | 1 hr |
| `/api/forecast/batch/:id/feed-cost` | GET | Cost projection | 1 hr |
| `/api/forecast/batch/:id/profitability` | GET | Profit scenarios | 30 min |
| `/api/forecast/market/optimal-sell-date` | GET | Best sell window | 1 hr |
| `/api/analytics/batch/:id/fcr` | GET | Feed conversion ratio | 1 hr |
| `/api/analytics/benchmark` | GET | Batch performance comparison | 6 hr |

---

## Dependencies to Add

```json
// package.json additions
{
  "dependencies": {
    "simple-statistics": "^7.8.0",
    "ml-regression": "^5.0.0"
  }
}
```

---

## Configuration

```env
# .env additions
FORECAST_TARGET_WEIGHT_KG=95
FORECAST_DEFAULT_DAYS=30
MARKET_PRICE_CONSERVATIVE_BUFFER=0.9
MARKET_PRICE_OPTIMISTIC_BUFFER=1.1
```

---

## Testing Checklist

- [ ] Unit tests for linear regression utilities
- [ ] Integration tests with mock batch data
- [ ] Verify cache invalidation on weight/feed updates
- [ ] Load test forecast endpoints
- [ ] Validate against known completed batches

---

## Future Considerations

1. **Multi-location market prices** - User's province affects price
2. **Seasonal breeding patterns** - Dry vs wet season growth differences
3. **Integration with government price APIs** - Reduce SearchAPI dependency
4. **Mobile push notifications** - "Optimal sell window approaching"
5. **Export to Excel/PDF** - Reports for record keeping