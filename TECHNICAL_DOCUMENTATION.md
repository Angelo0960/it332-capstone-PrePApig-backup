# PrepAPig - Technical Documentation

## System Overview

PrepAPig is an AI-powered pig growth tracking and farm management system designed for pig farmers. It provides comprehensive tools for batch management, feed tracking, vaccination scheduling, expense tracking, growth monitoring, and predictive analytics.

**Tech Stack:**
- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router 7
- **Backend:** Node.js, Express 5, Supabase (PostgreSQL), Firebase Admin SDK
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Authentication:** Supabase Auth + Custom JWT
- **Real-time:** Firebase Cloud Messaging (FCM)
- **Caching:** Custom Supabase-based cache layer
- **Scheduling:** node-cron for automated notifications
- **AI/ML:** Google GenAI (@google/genai) for forecasting
- **Charts:** Recharts
- **PWA:** Vite PWA plugin, Workbox

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend       │     │   Database      │
│   (React/Vite)  │◄───►│   (Express)     │◄───►│   (Supabase)    │
│   Port: 5173    │     │   Port: 5000    │     │   PostgreSQL    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │   External      │
                        │   Services      │
                        │ • Firebase FCM  │
                        │ • Google GenAI  │
                        └─────────────────┘
```

---

## Backend Structure

### Entry Point: `backend/app.js`

Main Express application setup with:
- CORS configuration (supports multiple Vercel preview deployments)
- Rate limiting (100 req/15min)
- Request logging middleware
- Route registration for all modules
- Scheduler initialization

### Configuration (`backend/config/`)

| File | Purpose |
|------|---------|
| `supabase.js` | Supabase client initialization |
| `firebase.js` | Firebase Admin SDK for FCM |
| `gemini.js` | Google GenAI client for AI forecasting |
| `constants.js` | Application constants |

### Routes (`backend/routes/`)

| Route File | Base Path | Description |
|------------|-----------|-------------|
| `authRoutes.js` | `/auth` | Authentication (register, login, refresh) |
| `pigRoutes.js` | `/pigs` | Batch & individual pig management |
| `feedRoutes.js` | `/feeds` | Feed records & stock management |
| `feedProgramRoutes.js` | `/feed-program` | 26-week feed schedule & forecasting |
| `vaccineRoutes.js` | `/vaccinations` | Vaccination records & stock |
| `expensesRoutes.js` | `/expenses` | Expense tracking |
| `reportRoutes.js` | `/reports` | Dashboard & analytics reports |
| `notificationRoutes.js` | `/notifications` | FCM token registration & notifications |
| `marketRoutes.js` | `/api/market` | Market price data |
| `forecastRoutes.js` | `/api/forecast` | AI-powered growth & cost forecasting |
| `cronRoutes.js` | `/api/cron` | Manual trigger endpoints for cron jobs |

### Controllers (`backend/controllers/`)

Each controller handles business logic for its domain:
- **authController.js** - Supabase Auth integration, JWT management
- **pigController.js** - Batch CRUD, individual pigs, weight history, FCR
- **feedController.js** - Feed records, auto weight gain calculation, FCM notifications
- **vaccineController.js** - Vaccinations, stock deduction, notifications
- **expensesController.js** - Expense CRUD & summaries
- **reportController.js** - Dashboard, feed & expense reports
- **forecastController.js** - Days to market, feed needs, cost & profitability projections
- **notificationController.js** - Device token management, manual triggers
- **cronController.js** - Manual cron job triggers

### Services (`backend/services/`)

| Service | Purpose |
|---------|---------|
| `notificationServices.js` | Daily feed reminders, vaccination alerts, feed change notifications |
| `marketPriceService.js` | Market price fetching & caching |
| `marketPriceCacheService.js` | Cache layer for market prices |
| `searchApiService.js` | External API search integration |

### Libraries (`backend/lib/`)

| Library | Purpose |
|---------|---------|
| `fcrService.js` | FCR calculation, weight gain, batch weight updates, pig sync |
| `feedScheduleService.js` | 26-week feed program, validation, change detection |
| `feedProgram.js` | Static feed program data (26 weeks), cost forecasting |
| `forecastUtils.js` | Linear regression, moving averages, profitability projections |
| `supabaseCache.js` | Database-backed caching with TTL |

### Scheduler (`backend/scheduler.js`)

Runs via node-cron:
- **6:00 AM daily**: Feed reminders + vaccination reminders + feed change checks
- **Hourly**: Feed reminders (catch-up)

---

## Database Schema (Supabase/PostgreSQL)

### Core Tables

```sql
-- Pig Batches (main entity)
pig_batches (
    id UUID PK,
    batch_code VARCHAR(50) UNIQUE,
    pig_count INTEGER,
    breed VARCHAR(100),
    start_weight DECIMAL(8,2),
    current_weight DECIMAL(8,2),
    date_acquired DATE,
    status VARCHAR(20), -- 'Active' | 'Completed' | 'Sold'
    owner_id UUID FK → auth.users,
    weight_history JSONB, -- [{date, weight, source, notes}]
    current_fcr DECIMAL(5,2),
    fcr_source VARCHAR(20), -- 'default' | 'calculated' | 'manual'
    fcr_confidence VARCHAR(20),
    fcr_data_points INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Individual Pigs
pigs (
    id UUID PK,
    batch_id UUID FK → pig_batches,
    weight DECIMAL(8,2),
    health_status VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Feed Records
feed_records (
    id UUID PK,
    batch_id UUID FK → pig_batches,
    feed_type VARCHAR(100),
    quantity_kg DECIMAL(8,2),
    feeding_date DATE,
    feeding_time TIME,
    notes TEXT,
    reminder_sent BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Feed Stocks
feed_stocks (
    id UUID PK,
    feed_type VARCHAR(100) UNIQUE,
    stock_quantity DECIMAL(8,2),
    unit_price DECIMAL(10,2),
    last_updated TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)

-- Vaccination Records
vaccination_records (
    id UUID PK,
    batch_id UUID FK → pig_batches,
    vaccine_name VARCHAR(100),
    vaccination_date DATE,
    next_due_date DATE,
    administered_by VARCHAR(100),
    dosage INTEGER,
    status VARCHAR(20), -- 'Completed' | 'Scheduled' | 'Overdue'
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Vaccine Stocks
vaccine_stocks (
    id UUID PK,
    vaccine_name VARCHAR(100) UNIQUE,
    stock_quantity INTEGER,
    price_per_dose DECIMAL(10,2),
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Expenses
expenses (
    id UUID PK,
    batch_id UUID FK → pig_batches (nullable),
    expense_type VARCHAR(50),
    amount DECIMAL(10,2),
    expense_date DATE,
    description TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Notifications
notifications (
    id UUID PK,
    user_id UUID FK → auth.users,
    title VARCHAR(200),
    message TEXT,
    type VARCHAR(50),
    is_read BOOLEAN,
    recipient_token VARCHAR(500),
    created_at TIMESTAMPTZ
)

-- User Devices (FCM Tokens)
user_devices (
    id UUID PK,
    user_id UUID FK → auth.users,
    fcm_token VARCHAR(500) UNIQUE,
    device_type VARCHAR(20),
    app_version VARCHAR(20),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Market Price Reports
market_price_reports (
    id UUID PK,
    report_date DATE,
    price_per_kg DECIMAL(10,2),
    source VARCHAR(100),
    region VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ
)
```

### Cache Tables

```sql
dashboard_cache, feed_summary_cache, expense_summary_cache, 
batch_list_cache, api_cache (key, data JSONB, expires_at TIMESTAMPTZ)
```

### Row Level Security (RLS)

All tables have RLS enabled. Policies ensure users only access their own data via `auth.uid()` checks against `owner_id` or `user_id` columns.

---

## Feed Program (26-Week Schedule)

Defined in `backend/lib/feedProgram.js`:

| Phase | Weeks | Ration | Feed Type | Daily FC (kg/pig) |
|-------|-------|--------|-----------|-------------------|
| Starter | 1-4 | Tmpbcs | Starter Mash | 0.04 - 0.10 |
| Grower | 5-10 | HGPSM | Grower Pellet | 0.30 - 1.20 |
| Finisher 1 | 11-15 | HS-Premium | Finisher | 1.30 - 1.80 |
| Finisher 2 | 16-26 | HG-Premium | Finisher | 1.90 - 2.50 |

**Key Functions:**
- `getCurrentFeedProgram(batch)` - Current week's feed target
- `getNextFeedChange(batch)` - Upcoming ration/phase change
- `validateFeedRation(batch, feedType)` - Validates feed matches phase
- `getFeedCostForecast(batch, feedStocks, weeks)` - Cost projection

---

## FCR (Feed Conversion Ratio) System

Located in `backend/lib/fcrService.js`:

### FCR Sources (Priority Order)
1. **Manual** - User-set `current_fcr` with `fcr_source='manual'`
2. **Calculated** - Computed from feed records + weight history
3. **Default** - Phase-based defaults: Starter=2.0, Grower=2.8, Finisher=2.5

### Calculation
```
FCR = Total Feed (kg) / Total Weight Gain (kg)
Weight Gain = Feed (kg) / FCR
```

### Auto Weight Update Flow
1. User logs feed → `createFeedRecord()`
2. Get effective FCR for batch
3. Calculate weight gain: `feedKg / FCR`
4. Update `pig_batches.current_weight` + `weight_history`
5. Sync individual `pigs` table (average weight per pig)

---

## Forecasting & Analytics

### Forecast Utilities (`backend/lib/forecastUtils.js`)

| Function | Purpose |
|----------|---------|
| `linearRegression(x, y)` | Daily gain rate via simple-statistics |
| `calculateDaysToMarket()` | Days to reach target weight (95kg default) |
| `projectFeedNeeds()` | Feed forecast with trend adjustment |
| `projectFeedCost()` | Cost projection using feed stock prices |
| `projectProfitability()` | 3 scenarios: conservative/expected/optimistic |

### Forecast Endpoints (`/api/forecast/batch/:id/`)
- `days-to-market` - Estimated days & date to market weight
- `feed-needs` - Projected feed consumption (kg) by type
- `feed-cost` - Projected feed cost (PHP)
- `profitability` - Revenue, cost, profit scenarios

---

## Authentication Flow

```
1. User registers/logs in via Supabase Auth
2. Backend generates custom JWT (1-day expiry)
3. Frontend stores token in localStorage
4. Requests include: Authorization: Bearer <token>
5. authMiddleware verifies JWT → req.user = {id, email}
6. Token refresh via /auth/refresh (ignores expiration)
```

**Special Case:** Admin login (email: 'admin', password: 'admin') bypasses Supabase.

---

## Notification System

### FCM Integration
- Frontend requests notification permission → gets FCM token
- Token registered via `/notifications/register-token`
- Backend uses Firebase Admin SDK to send push notifications

### Automated Notifications (via scheduler)
1. **Daily Feed Reminders** - Checks `feed_records` for today with `reminder_sent=false`
2. **Vaccination Reminders** - Due today, newly overdue, repeat reminders (7 days)
3. **Feed Change Alerts** - Due today or within 3 days

### Notification Types
- `feed_reminder` - Daily feeding schedule
- `vaccination_reminder` - Due today
- `vaccination_overdue` - Newly overdue
- `vaccination_overdue_repeat` - Repeat reminder
- `feed_change_due` - Feed transition due today
- `feed_change_upcoming` - Feed transition in 1-3 days
- `feed` / `vaccination` - Record creation confirmations

---

## Caching Strategy

**Backend:** `backend/lib/supabaseCache.js`
- Database-backed cache tables with TTL
- Cache keys: `dashboard`, `feed_summary`, `expense_summary`, `batch_list`, `feedByBatch`, etc.
- Invalidation on data mutations (create/update/delete)

**TTL Configuration:**
- Dashboard: 5 min
- Feed/Expense summaries: 10 min
- Batch lists: 5 min

---

## Frontend Structure

### Pages (`frontend/src/pages/`)

| Page | Route | Purpose |
|------|-------|---------|
| `LoginPage.jsx` | `/` | Authentication |
| `DashboardScreen.jsx` | `/dashboard` | Main dashboard with batch carousel |
| `FeedsInventoryScreen.jsx` | `/feeds` | Feed records, stock, schedule |
| `VaccinationScreen.jsx` | `/vaccination` | Vaccination management |
| `BatchPigsScreen.jsx` | `/batch/:batchId/pigs` | Individual pig management |
| `AnalyticsReportScreen.jsx` | `/reports` | Analytics & forecasting |

### Key Components

| Component | Purpose |
|-----------|---------|
| `BottomNav.jsx` | Mobile navigation |
| `PWAComponents.jsx` | Install prompt, update banner, offline indicator |

### API Layer (`frontend/src/api.js`)

Centralized API client with:
- `API_BASE` from `VITE_API_BASE` env
- Automatic token refresh on 401
- `apiFetch()` wrapper with auth headers
- Modular API objects: `feedProgramApi`, `feedScheduleApi`, `weightApi`

### State Management
- React `useState`/`useEffect` for local state
- `eventBus.js` for cross-component events (`BATCH_UPDATED`, `FEED_LOGGED`)

---

## API Endpoints Reference

### Authentication
```
POST   /auth/register          - Register new user
POST   /auth/login             - Login (returns JWT)
POST   /auth/refresh           - Refresh expired token
```

### Batches (`/pigs`)
```
POST   /create                 - Create batch + auto-generate pigs
GET    /all                    - List all batches (with feed schedule)
GET    /active                 - Active batches only
GET    /summary                - Count summary
GET    /:id                    - Batch details + full feed schedule
PUT    /:id                    - Update batch
DELETE /:id                    - Delete batch
PATCH  /:id/weight             - Update current weight

GET    /batch/:batchId/pigs    - List pigs in batch
POST   /pig                    - Create individual pig
PUT    /pig/:id                - Update pig
DELETE /pig/:id                - Delete pig

GET    /:id/weight-history     - Weight history
POST   /:id/weight-log         - Manual weight entry
GET    /:id/fcr                - FCR data + trend
POST   /:id/fcr/recalculate    - Recalculate FCR from history

GET    /:id/feed-schedule      - Complete feed schedule
POST   /:id/validate-ration    - Validate feed type for batch
```

### Feed Records (`/feeds`)
```
POST   /create                 - Create feed record (auto weight gain + notification)
GET    /all                    - All feed records
GET    /batch/:batchId         - Records for batch
GET    /summary                - Total feed consumed

GET    /stock                  - Feed stock levels
POST   /stock/update           - Update/restock feed

GET    /:id                    - Single record
PUT    /:id                    - Update record
DELETE /:id                    - Delete record
```

### Feed Program (`/feed-program`)
```
GET    /full                   - Full 26-week program
GET    /week/:week             - Specific week
GET    /batch/:batchId/target  - Current feed target for batch
GET    /batch/:batchId/cost-forecast?weeks=4  - Cost forecast
GET    /batch/:batchId/actual-vs-planned?weeks=4  - Actual vs planned
GET    /ration-map             - Ration → feed type mapping
```

### Vaccinations (`/vaccinations`)
```
POST   /create                 - Create record (deducts stock + notification)
GET    /all                    - All records
GET    /batch/:batchId         - Records for batch
GET    /upcoming               - Due/overdue vaccinations
GET    /stock                  - Vaccine stock
POST   /stock/update           - Update vaccine stock
GET    /:id                    - Single record
```

### Expenses (`/expenses`)
```
POST   /create                 - Create expense
GET    /all                    - All expenses
GET    /summary                - Total expenses
GET    /:id                    - Single expense
PUT    /:id                    - Update expense
DELETE /:id                    - Delete expense
```

### Reports (`/reports`)
```
GET    /dashboard              - Dashboard summary
GET    /feeds                  - Feed consumption report
GET    /expenses               - Expense report
```

### Notifications (`/notifications`)
```
POST   /send                   - Create notification
GET    /all                    - User notifications
PATCH  /:id/read               - Mark as read
DELETE /:id                    - Delete notification
POST   /register-token         - Register FCM token
POST   /trigger-feed-reminders - Manual feed reminder trigger
POST   /trigger-vaccination-reminders - Manual vaccination trigger
```

### Forecasting (`/api/forecast/batch/:id/`)
```
GET    /days-to-market         - Days to market weight
GET    /feed-needs?days=30     - Feed projection
GET    /feed-cost?days=30      - Feed cost projection
GET    /profitability          - Profitability scenarios
```

### Cron Triggers (`/api/cron`)
```
POST   /trigger-feed-reminders
POST   /trigger-vaccination-reminders
POST   /trigger-feed-change-check
```

---

## Key Algorithms

### Feed Schedule Computation
```javascript
// Week calculation
weeksSinceAcquired = floor((now - dateAcquired) / (7 * 24 * 60 * 60 * 1000)) + 1
// Clamped to 1-26

// Feed change detection
For each week 2-26:
  if ration or phase differs from previous week:
    changeDate = dateAcquired + (week - 1) * 7 days
    daysUntil = ceil((changeDate - now) / (24 * 60 * 60 * 1000))
```

### FCR Calculation
```javascript
totalFeedKg = sum(feedRecords.quantity_kg)
weightGain = lastWeight - firstWeight (from sorted weight_history)
fcr = totalFeedKg / weightGain
confidence: high(≥10 pts), medium(≥5), low(<5)
```

### Daily Gain Rate (Linear Regression)
```javascript
x = [0, 1, 2, ...] // days index
y = weightHistory.map(h => h.weight)
slope = daily gain rate (kg/day)
rSquared = confidence metric
```

### Profitability Projection
```javascript
daysToMarket = (targetWeight - currentWeight) / dailyGainRate
totalRevenue = targetWeight * pigCount * marketPrice (₱190/kg default)
totalCost = currentExpenses + projectedFeedCost + remainingExpenses
netProfit = totalRevenue - totalCost
Scenarios: conservative(0.9x), expected(1.0x), optimistic(1.1x)
```

---

## Environment Variables

### Backend (`backend/.env`)
```env
PORT=5000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=your_jwt_secret
FIREBASE_ADMIN_SDK_CONFIG=path_to_service_account.json
GEMINI_API_KEY=your_gemini_key
FORECAST_TARGET_WEIGHT_KG=95
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE=http://localhost:5000
VITE_VAPID_KEY=your_firebase_vapid_key
```

---

## Development Setup

```bash
# Backend
cd backend
npm install
npm run dev    # nodemon on port 5000

# Frontend
cd frontend
npm install
npm run dev    # Vite on port 5173
```

### Database Migration Order
1. `backend/supabase/main_tables_migration.sql`
2. `backend/supabase/fcr_migration.sql`
3. `backend/supabase/cache_tables.sql`

---

## Deployment Notes

- **Frontend:** Vercel (static build via `npm run build`)
- **Backend:** Render/Railway/Heroku (Node.js service)
- **Database:** Supabase (managed PostgreSQL)
- **CORS:** Configured for Vercel preview deployments automatically
- **PWA:** Service worker via `vite-plugin-pwa`, manifest in `dist/`

---

## Testing Scripts

Located in `backend/scripts/`:
- `test_fcr.js` - FCR calculation tests
- `test_fcr_api.js` - FCR API integration tests
- `test_feed_update.js` - Feed weight update tests
- `check_batches.js` - Batch data verification
- `check_feeds.js` - Feed records verification
- `check_pigs_sync.js` - Individual pig sync verification
- `fix_batch10.js` - Data correction script
- `backfill_pigs.js` - Historical pig generation

---

## Security Considerations

1. **RLS Policies** - All data access controlled at database level
2. **JWT Verification** - Middleware validates token on every request
3. **Input Validation** - express-validator on routes (where implemented)
4. **Rate Limiting** - 100 req/15min global, stricter for auth
5. **FCM Token Cleanup** - Invalid tokens removed on send failure
6. **No Secrets in Code** - All keys via environment variables

---

## Known Limitations / TODOs

1. **Feed Program Routes** - Referenced in frontend but route file not found in backend
2. **Market Price Service** - Integration incomplete
3. **Gemini AI** - Forecasting uses statistical methods; GenAI integration placeholder
4. **Offline Support** - PWA configured but IndexedDB sync not fully implemented
5. **Test Coverage** - No automated test suite (manual scripts only)
6. **TypeScript** - Codebase is JavaScript; migration would improve maintainability