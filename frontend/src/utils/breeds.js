/**
 * Pig breeds available when creating a batch.
 *
 * Kept as a fixed list so batches are recorded with consistent breed names
 * rather than free text, which makes grouping and reporting reliable.
 */
export const PIG_BREEDS = [
  'Large White',
  'Landrace',
  'Duroc',
  'Duroc Jersey',
  'F1 Hybrids',
];

/** Used when no breed is chosen, matching the previous free-text fallback. */
export const DEFAULT_BREED = 'Unknown';

export default PIG_BREEDS;
