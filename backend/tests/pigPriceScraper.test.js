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
  const csv = [
    'series,date,period,value,unit,geo,accessed_on',
    'hog-farmgate-household-regional,2026-04-30,2026-04,160,PHP/kg liveweight,0401000000,2026-08-20',
    'hog-farmgate-household-regional,2026-05-31,2026-05,164.58,PHP/kg liveweight,0401000000,2026-08-20',
    'hog-farmgate-household-regional,2026-06-30,2026-06,167.9,PHP/kg liveweight,0401000000,2026-08-20',
    'hog-farmgate-average-regional,2026-06-30,2026-06,NA,PHP/kg liveweight,0401000000,2026-08-20',
  ].join('\n');
  const result = await fetchBatangasPigPrice({
    now: Date.parse('2026-10-08T00:00:00.000Z'),
    fetchImpl: async () => ({ ok: true, text: async () => csv }),
  });
  assert.equal(result.success, true);
  assert.equal(result.data.period, '2026-06');
  assert.equal(result.data.pricePhpPerKg, 167.9);
  assert.equal(result.data.location, 'Calaca, Batangas (province-level source)');
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
