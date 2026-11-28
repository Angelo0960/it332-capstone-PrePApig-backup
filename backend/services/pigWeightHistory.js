export const groupWeightHistoryByPig = (records = []) => {
  const historyByPig = new Map();
  for (const record of records) {
    const rows = historyByPig.get(record.pig_id) || [];
    rows.push(record);
    historyByPig.set(record.pig_id, rows);
  }
  return historyByPig;
};

export const attachWeightHistoryToPigs = (pigs = [], records = [], available = true) => {
  const historyByPig = groupWeightHistoryByPig(records);
  return pigs.map((pig) => ({
    ...pig,
    weight_history: historyByPig.get(pig.id) || [],
    weight_history_available: available,
  }));
};
