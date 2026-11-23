const HIDDEN_DEMO_NOTE_MARKERS = [
  'synthetic forecast demo data',
  'vaccination record is for testing only',
];

export const shouldDisplayRecordNote = (notes) => {
  const normalized = String(notes || '').trim().replace(/^['"]|['"]$/g, '').trim().toLowerCase();
  return Boolean(normalized)
    && !HIDDEN_DEMO_NOTE_MARKERS.some((marker) => normalized.includes(marker));
};

export const shouldDisplayFeedRecordNote = (notes) => {
  const normalized = String(notes || '').trim().toLowerCase();
  return shouldDisplayRecordNote(notes)
    && !normalized.includes('historical feed import: feedusage.xlsx; pig weights unchanged');
};