export const buildBatchDisplayNames = (batches = []) => {
  const ordered = [...batches].sort((left, right) => {
    const leftTime = new Date(left.created_at || left.date_acquired || 0).getTime();
    const rightTime = new Date(right.created_at || right.date_acquired || 0).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });

  return new Map(
    ordered.map((batch, index) => [
      String(batch.id),
      `Batch-${String(index + 1).padStart(2, '0')}`,
    ])
  );
};

export const getBatchDisplayName = (batch, batches = []) => {
  if (!batch) return 'Batch';
  const names = buildBatchDisplayNames(batches);
  return names.get(String(batch.id)) || 'Batch';
};
