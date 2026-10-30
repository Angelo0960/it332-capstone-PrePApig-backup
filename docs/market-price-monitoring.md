# Live Batangas Hog Market Price Monitoring

## Existing functionality

- `GET /market-prices/pigs` retrieves the latest province-level Batangas reference from the Baboy PH / PSA household farmgate CSV.
- `POST /market-prices/pigs/ai-analysis` uses the existing Gemini integration and Google Search grounding, with secondary provider fallbacks.
- `backend/services/webPigPriceSearchService.js` now performs location-specific Google Custom Search requests for Lemery, Calaca, Tuy, Balayan, Lian, Nasugbu, and Taal.

## New functionality

- `POST /market-prices/refresh` searches configured municipalities and stores valid observations in `pig_market_prices`.
- `GET /market-prices/history` returns stored observations for authenticated users.
- `GET /market-prices/forecast` returns a four-week statistical trend forecast only when a municipality has at least eight dated observations. The forecast includes chronological holdout MAE and a residual interval; it does not invent missing values.
- A daily worker runs at 02:15 in `APP_TIMEZONE` when `MARKET_PRICE_REFRESH_ENABLED` is not `false`.
- Analytics includes a manual `Refresh prices` action, historical observations, and an insufficient-history-aware forecast panel.

## Required migration

Run this SQL manually in the Supabase SQL Editor before enabling refresh/history:

```text
backend/config/migrations/20261030_create_pig_market_prices.sql
```

Deploying Render does not automatically apply migrations.

## Required Render variables

```text
GOOGLE_SEARCH_API_KEY
GOOGLE_SEARCH_ENGINE_ID
MARKET_PRICE_REFRESH_ENABLED=true
```

`SERPER_API_KEY` remains an optional fallback. Gemini remains server-side and is not exposed to the frontend.

## Data rules

- Prices are stored as PHP/kg liveweight or farmgate observations.
- Retail pork and dressed-meat snippets are rejected by the parser.
- Search snippets without an original report date remain `unverified`.
- Dated public observations are marked `partially_verified`; they still require buyer confirmation.
- Municipality prices are never substituted with the Batangas province-level CSV value.
- Missing observations remain unavailable; the system does not interpolate missing market prices.
- Forecasting uses only stored dated observations and is separate from Gemini interpretation.

## Google Search configuration

The Google Custom Search JSON API is the primary web searcher. Each municipality receives a date-aware query such as:

```text
presyo ng buhay na baboy Lemery Batangas October 2026 liveweight farmgate price per kilogram
```

The raw source URL, query, evidence snippet, observation date when available, verification state, and retrieval timestamp are preserved.

## Limitations

Google result snippets are leads and public observations, not guaranteed buyer offers. A current buyer should confirm the price, municipality, date, weight basis, and grade before a sale. Google Search API quotas and Gemini quotas can prevent a refresh. Production database migration and Render environment configuration must be completed separately.
