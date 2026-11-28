import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BATANGAS_PSGC,
  clearPigPriceCache,
  fetchBatangasPigPrice,
  parseCsv,
} from '../services/pigPriceScraper.js';

test('CSV parser handles quoted fields and commas', () => {
  const rows = parseCsv('geo,value,note\n0401000000,167.9,"Batangas, province"');
  assert.equal(rows[0].geo, BATANGAS_PSGC);
  assert.equal(rows[0].value, '167.9');
  assert.equal(rows[0].note, 'Batangas, province');
});

test('scraper selects the newest non-empty Batangas record', async () => {
  clearPigPriceCache();
  const metadata = {
    variables: [
      { code: 'Geolocation', values: [BATANGAS_PSGC, '0402100000'], valueTexts: ['Batangas', 'Cavite'] },
      { code: 'Type', values: ['hog'], valueTexts: ['Hog for Slaughter'] },
      { code: 'Year', values: ['2026'], valueTexts: ['2026'] },
      { code: 'Month', values: ['04', '05', '06', 'annual'], valueTexts: ['April', 'May', 'June', 'Annual'] },
    ],
  };
  const csv = [
    'Geolocation,Type,2026 April,2026 May,2026 June',
    'Batangas,Hog for Slaughter,160,164.58,167.9',
    'Cavite,Hog for Slaughter,155,159,162',
  ].join('\n');
  let requests = 0;
  const result = await fetchBatangasPigPrice({
    now: Date.parse('2026-10-08T00:00:00.000Z'),
    fetchImpl: async () => {
      requests += 1;
      return requests === 1
        ? { ok: true, json: async () => metadata }
        : { ok: true, text: async () => csv };
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.period, '2026-06');
  assert.equal(result.data.pricePhpPerKg, 167.9);
  assert.equal(result.data.location, 'Batangas province');
  assert.equal(result.basis.length, 3);
  assert.equal(result.basisSummary.averagePricePhpPerKg, 164.16);
});

test('scraper reports source failures', async () => {
  clearPigPriceCache();
  await assert.rejects(
    fetchBatangasPigPrice({ fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /HTTP 503/
  );
});
