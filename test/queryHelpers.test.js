import assert from 'assert';
import { describe, it } from 'node:test';
import { buildUserWhere, normalizePagination } from '../utils/queryHelpers.js';

// Minimal mock for a sql tag that returns an object representing the fragment
function sqlTag(strings, ...values) {
  // Reconstruct a simple representation: raw string with placeholders replaced
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === 'object' && 'text' in v) out += v.text;
      else out += String(v);
    }
  }
  return { text: out.trim() };
}

describe('queryHelpers', () => {
  it('normalizePagination clamps values', () => {
    assert.deepStrictEqual(normalizePagination('10', '5'), { limitNum: 10, offsetNum: 5 });
    assert.deepStrictEqual(normalizePagination('0', '-3'), { limitNum: 1, offsetNum: 0 });
    assert.deepStrictEqual(normalizePagination('9999', '0'), { limitNum: 500, offsetNum: 0 });
  });

  it('buildUserWhere builds single filters', () => {
    const all = buildUserWhere(sqlTag, 'all', '');
    assert.strictEqual(all.text, '');

    const active = buildUserWhere(sqlTag, 'active', '');
    assert.ok(active.text.includes('WHERE'));
    assert.ok(active.text.includes('is_frozen = FALSE'));

    const frozen = buildUserWhere(sqlTag, 'frozen', '');
    assert.ok(frozen.text.includes('is_frozen = TRUE'));
  });

  it('buildUserWhere combines filters with AND and includes LIKE when q provided', () => {
    const combined = buildUserWhere(sqlTag, 'active', 'john');
    assert.ok(combined.text.includes('WHERE'));
    assert.ok(combined.text.includes('is_frozen = FALSE'));
    assert.ok(combined.text.toLowerCase().includes('lower(username) like'));
    assert.ok(combined.text.includes('%john%'));
  });
});
