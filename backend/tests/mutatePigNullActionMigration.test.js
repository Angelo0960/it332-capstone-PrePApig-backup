import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrations = [
  '20261127_individual_pig_weight_history.sql',
  '20261128_acquisition_based_pig_history.sql',
  '20261128_record_new_pig_weighins_on_creation.sql',
];
const migrationDir = fileURLToPath(new URL('../config/migrations/', import.meta.url));

test('every pig mutation migration rejects a NULL action before branching', async () => {
  for (const migration of migrations) {
    const sql = await readFile(path.join(migrationDir, migration), 'utf8');
    const functionBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.mutate_pig_and_sync_batch\([\s\S]*?\n\$\$;/,
    )?.[0];

    assert.ok(functionBody, `${migration} defines mutate_pig_and_sync_batch`);
    assert.match(
      functionBody,
      /IF\s+p_owner_id\s+IS NULL\s+OR\s+p_action\s+IS NULL\s+OR\s+p_action\s+NOT IN\s*\('create',\s*'update',\s*'delete'\)/i,
      `${migration} must reject NULL p_action in the initial validation guard`,
    );
  }
});
