# Feed Consumption Forecasting

## Source model

The forecasting service supports two explicit sources:

- `recorded`: owner-scoped PrepAPig `feed_records` rows.
- `uploaded_historical`: the uploaded historical dataset committed under `backend/config/data/`.

The uploaded source includes:

- `PrepAPig_5Y_Daily_Feed_Usage.csv`: 2,730 uploaded daily consumption rows.
- `PrepAPig_5Y_Weekly_Forecast.csv`: weekly planned/actual, variance, 50 kg bag, and price/cost fields.
- `PrepAPig_5_Year_Synthetic_Feed_Dataset.xlsx`: workbook reference with `Daily Usage` and `Weekly Forecast` sheets.

The uploaded rows are used as the active historical forecasting dataset and are filtered to dates no later than the current server date.

## Analytics integration

The Analytics dashboard now requests:

```text
GET /feeds/forecast?source=uploaded_historical&batch_id=all&horizon_weeks=4&include_ai=true
```

It displays uploaded historical actual consumption, planned consumption, variance, projected 50 kg bag equivalents, a four-week forecast line, forecast error, and source dates. The Feed/Inventory screen continues to support the separate recorded-database forecast.

The dashboard automatically requests AI interpretation after the weekly forecast is loaded:

```text
POST /feeds/forecast/ai-analysis
```

The AI also reads the authenticated user's `feed_stocks` rows and compares total current stock against the four-week forecast. It reports stock kilograms, projected coverage in weeks, projected shortfall, and a next action such as purchase feed, monitor usage, or avoid unnecessary buying. If the stock table is unavailable, the AI result remains clearly limited rather than inventing inventory data.
## Forecast behavior

`GET /feeds/forecast`:

- Authenticated route.
- Uses the uploaded weekly forecast CSV when `source=uploaded_historical`.
- Uses the most recent 16 valid historical weeks by default.
- Requires at least 8 historical weeks.
- Fits a transparent linear trend.
- Holds out the latest 20% of observations for evaluation.
- Returns mean absolute error and a residual-based interval.
- Returns projected bags and projected cost when the uploaded weekly price field is available.
- Returns explicit `insufficient_data` instead of inventing history.

## Limitations

The forecast is a lightweight statistical trend, not an AI-generated number and not a replacement for the farm's feeding schedule. Forecast output is separate from authoritative recorded feed, inventory, expense, financial, and FCR calculations.
