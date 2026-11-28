import assert from 'node:assert/strict';
import test from 'node:test';

const loadCalculator = async () => import('../src/utils/financialSummary.js').catch(() => null);

test('calculates recorded costs from loaded report rows without waiting for financial endpoint data', async () => {
  const module = await loadCalculator();
  assert.equal(typeof module?.calculateTotalRecordedCosts, 'function', 'recorded-cost calculator should be available');

  assert.equal(module.calculateTotalRecordedCosts({
    expenses: [{ amount: 25.50 }, { amount: '12.25' }],
    feedCost: 3.10,
    vaccineCost: 1.15,
    recordsReady: true,
  }), 42);
});

test('keeps recorded costs unavailable until all required records are ready and valid', async () => {
  const module = await loadCalculator();
  assert.equal(typeof module?.calculateTotalRecordedCosts, 'function', 'recorded-cost calculator should be available');

  assert.equal(module.calculateTotalRecordedCosts({ expenses: [], feedCost: 0, vaccineCost: 0, recordsReady: false }), null);
  assert.equal(module.calculateTotalRecordedCosts({ expenses: [], feedCost: 0, vaccineCost: null, recordsReady: true }), null);
  assert.equal(module.calculateTotalRecordedCosts({ expenses: [{ amount: 'bad' }], feedCost: 0, vaccineCost: 0, recordsReady: true }), null);
});
