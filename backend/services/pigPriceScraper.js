const PRICE_SOURCE_URL =
  'https://baboyph.com/data/hog-farmgate-household-regional.csv';
const BATANGAS_PSGC = '0401000000';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache = { expiresAt: 0, value: null };

const parseCsvLine = (line) => {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
};

const parseCsv = (csv) => {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {});
  });
};

const toPriceRecord = (row) => ({
  location: 'Calaca, Batangas (province-level source)',
  province: 'Batangas',
  source: 'Baboy PH / PSA OpenSTAT household farmgate archive',
  sourceUrl: PRICE_SOURCE_URL,
  period: row.period,
  date: row.date,
  pricePhpPerKg: Number(row.value),
  unit: row.unit,
  series: row.series,
  sourceAccessedOn: row.accessed_on || null,
  note:
    'Public source is reported at Batangas province level; a Calaca-only quote is not available in this dataset.',
});

export const fetchBatangasPigPrice = async ({ fetchImpl = fetch, now = Date.now() } = {}) => {
  if (cache.value && cache.expiresAt > now) return cache.value;

  const response = await fetchImpl(PRICE_SOURCE_URL, {
    headers: { 'User-Agent': 'PrepAPig/1.0 pig-price-monitor' },
  });
  if (!response.ok) {
    throw new Error(`Pig price source returned HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text())
    .filter((row) => row.geo === BATANGAS_PSGC && row.value && row.value !== 'NA')
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));

  if (rows.length === 0) {
    throw new Error('No Batangas pig price record was found in the source data');
  }

  const result = {
    success: true,
    data: toPriceRecord(rows[0]),
    fetchedAt: new Date(now).toISOString(),
    cacheExpiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
  };

  cache = { expiresAt: now + CACHE_TTL_MS, value: result };
  return result;
};

export const clearPigPriceCache = () => {
  cache = { expiresAt: 0, value: null };
};

export { PRICE_SOURCE_URL, BATANGAS_PSGC, parseCsv };
