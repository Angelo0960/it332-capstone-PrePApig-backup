# Feed Consumption Forecasting

## Source model

The forecasting service uses recorded PrepAPig `feed_records` rows with:

- `feeding_date`
- `quantity_kg`
- optional `batch_id`

The supplied synthetic files were used as the reference schema:

- `PrepAPig_5Y_Daily_Feed_Usage.csv`: daily actual-consumption records.
- `PrepAPig_5_Year_Synthetic_Feed_Dataset.xlsx`: `Daily Usage` and `Weekly Forecast` sheets.

The supplied workbook and CSV are explicitly synthetic. They are not copied into the production database and are not presented as real farm measurements.

## Forecast behavior

`GET /feeds/forecast?batch_id=all&horizon_days=7&window_days=28`:

- Authenticated and owner-scoped.
- Aggregates recorded feed usage by day.
- Uses the most recent 28 recorded days by default.
- Requires at least 14 distinct recorded days.
- Fits a linear trend to recent daily consumption.
- Holds out the latest 20% of observations for evaluation.
- Returns mean absolute error and a residual-based interval.
- Returns an explicit `insufficient_data` response instead of inventing history.

The endpoint returns recorded history and the forecast separately. The frontend renders recorded consumption as a solid green line and the seven-day forecast as a dashed purple line.

## Limitations

The forecast is a lightweight statistical trend, not an AI-generated number and not a replacement for the farm's feeding schedule. It does not use synthetic rows as live production data, does not infer missing days, and does not calculate feed purchases or profit.
