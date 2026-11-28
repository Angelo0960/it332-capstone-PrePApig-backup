const dateOnly = (value) => (value ? String(value).slice(0, 10) : '');

export const toPigWeightHistoryRows = (pigs) => pigs.flatMap((pig) => {
  const records = Array.isArray(pig.weight_history) && pig.weight_history.length > 0
    ? [...pig.weight_history]
    : pig.weight === null || pig.weight === undefined
      ? []
      : [{
        id: `snapshot-${pig.id}`,
        weigh_in_date: dateOnly(pig.updated_at || pig.created_at),
        age_days: null,
        recorded_weight: pig.weight,
        created_at: pig.updated_at || pig.created_at,
        is_snapshot: true,
      }];

  records.sort((left, right) => (
    String(left.weigh_in_date || '').localeCompare(String(right.weigh_in_date || ''))
    || String(left.created_at || '').localeCompare(String(right.created_at || ''))
    || String(left.id || '').localeCompare(String(right.id || ''))
  ));

  return records.map((record, index) => {
    const recordedWeight = Number(record.recorded_weight);
    const previousWeight = index === 0 ? null : Number(records[index - 1].recorded_weight);

    return {
      pigId: pig.id,
      pig,
      recordId: record.id,
      weighInDate: dateOnly(record.weigh_in_date),
      ageDays: record.age_days == null ? null : Number(record.age_days),
      recordedWeight,
      dailyChange: previousWeight === null
        ? null
        : Number((recordedWeight - previousWeight).toFixed(2)),
      isLatest: index === records.length - 1,
      isBaseline: Boolean(record.is_baseline),
      isSnapshot: Boolean(record.is_snapshot || record.is_baseline),
    };
  });
});
