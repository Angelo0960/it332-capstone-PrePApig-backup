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
    String(right.weigh_in_date || '').localeCompare(String(left.weigh_in_date || ''))
    || String(right.created_at || '').localeCompare(String(left.created_at || ''))
  ));

  return records.map((record, index) => ({
    pigId: pig.id,
    pig,
    recordId: record.id,
    weighInDate: dateOnly(record.weigh_in_date),
    ageDays: record.age_days == null ? null : Number(record.age_days),
    recordedWeight: Number(record.recorded_weight),
    isLatest: index === 0,
    isSnapshot: Boolean(record.is_snapshot || record.is_baseline),
  }));
}).sort((left, right) => (
  right.weighInDate.localeCompare(left.weighInDate)
  || String(right.recordId || '').localeCompare(String(left.recordId || ''))
  || String(left.pigId).localeCompare(String(right.pigId))
));
