import assert from 'node:assert/strict';
import test from 'node:test';
import { getGeminiModel } from '../services/geminiModel.js';

test('preserves an explicitly configured Gemini model so its quota budget is selected correctly', () => {
  assert.equal(getGeminiModel('gemini-3.6-flash'), 'gemini-3.6-flash');
  assert.equal(getGeminiModel('gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
});

test('defaults to the current Gemini 3 Flash model when no model is configured', () => {
  assert.equal(getGeminiModel(''), 'gemini-3.8-flash');
  assert.equal(getGeminiModel(undefined), 'gemini-3.8-flash');
});
