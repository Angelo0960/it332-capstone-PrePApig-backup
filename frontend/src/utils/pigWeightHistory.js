const dateOnly = (value) => (value ? String(value).slice(0, 10) : '');

export const getPigWeightHistoryRows = (pig) => {
  const records = Array.isArray(pig?.weight_history) ? [...pig.weight_history] : [];
  records.sort((left, right) => (
    String(left.weigh_in_date || '').localeCompare(String(right.weigh_in_date || ''))
    || String(left.created_at || '').localeCompare(String(right.created_at || ''))
    || String(left.id || '').localeCompare(String(right.id || ''))
  ));

  return records.flatMap((record, index) => {
    const recordedWeight = Number(record.recorded_weight);
    if (!Number.isFinite(recordedWeight)) return [];

    const previousWeight = index === 0 ? null : Number(records[index - 1].recorded_weight);
    const isBaseline = Boolean(record.is_baseline);
    return [{
      recordId: record.id,
      weighInDate: dateOnly(record.weigh_in_date),
      ageDays: record.age_days == null ? null : Number(record.age_days),
      recordedWeight,
      changeKg: previousWeight === null || !Number.isFinite(previousWeight)
        ? null
        : Number((recordedWeight - previousWeight).toFixed(2)),
      isBaseline,
      baselineLabel: !isBaseline
        ? null
        : record.baseline_source === 'batch_start'
          ? 'Batch start weight baseline'
          : 'Baseline snapshot; provenance unavailable',
    }];
  });
};
