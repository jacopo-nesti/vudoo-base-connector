import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, estimateImportDurationMs } from '../renderer/src/importTiming.js';
import { rateLimitGuidance } from '../renderer/src/rateLimitGuidance.js';

test('Durate GUI: millisecondi, secondi e minuti in formato italiano', () => {
  assert.equal(formatDuration(820), '820 ms');
  assert.equal(formatDuration(4200), '4,2 s');
  assert.equal(formatDuration(134000), '2 min 14 s');
  assert.equal(formatDuration(-1), 'non disponibile');
});

test('Stima iniziale usa prodotti, strategia batch e rate configurato', () => {
  const strategy = { bulkLookupThreshold: 50, detailsChunkSize: 100 };
  assert.equal(estimateImportDurationMs(333, 95, strategy), Math.ceil((1 + 4 + 333) * 60000 / 95));
  assert.equal(estimateImportDurationMs(5, 95, strategy), Math.ceil((10 + 5) * 60000 / 95));
  assert.ok(estimateImportDurationMs(333, 200, strategy) < estimateImportDurationMs(333, 95, strategy));
  assert.equal(estimateImportDurationMs(333, 95, { ...strategy, dryRun: true }), Math.ceil(5 * 60000 / 95));
  assert.equal(estimateImportDurationMs(0, 95), null);
});

test('Avviso rate limit distingue margine standard e quota superiore', () => {
  assert.match(rateLimitGuidance(95), /Valore consigliato/);
  assert.match(rateLimitGuidance(98), /vicino al limite/);
  assert.match(rateLimitGuidance(200), /non aumenta il limite API/);
});
