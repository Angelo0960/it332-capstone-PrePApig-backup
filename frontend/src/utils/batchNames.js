export const buildBatchDisplayNames = (batches = []) => {
  return new Map(
    batches.map((batch) => {
      const rawCode = String(batch.batch_code || batch.name || '').trim();
      const codeMatch = rawCode.match(/(?:batch[-\s]*)?(\d+)$/i);
      const name = codeMatch
        ? `Batch-${String(Number(codeMatch[1])).padStart(2, '0')}`
        : rawCode || 'Batch';
      return [String(batch.id), name];
    })
  );
};

export const getBatchDisplayName = (batch, batches = []) => {
  if (!batch) return 'Batch';
  const names = buildBatchDisplayNames(batches);
  return names.get(String(batch.id)) || 'Batch';
};
