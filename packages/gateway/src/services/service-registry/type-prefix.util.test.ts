import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateDefaultTypePrefix, normalizeTypePrefix } from './type-prefix.util';

describe('type-prefix util', () => {
  it('generates default prefix from service name', () => {
    assert.equal(generateDefaultTypePrefix('inventory graph'), 'InventoryGraph_');
    assert.equal(generateDefaultTypePrefix('123 service'), 'Svc123Service_');
    assert.equal(generateDefaultTypePrefix(''), 'Service_');
  });

  it('normalizes user provided prefix', () => {
    assert.equal(normalizeTypePrefix('Custom', 'users'), 'Custom_');
    assert.equal(normalizeTypePrefix('Custom_', 'users'), 'Custom_');
  assert.equal(normalizeTypePrefix('   spaces   ', 'users'), 'spaces_');
    assert.equal(normalizeTypePrefix('123abc', 'users'), '_123abc_');
  });

  it('falls back to default when input empty', () => {
    assert.equal(normalizeTypePrefix('', 'orders service'), 'OrdersService_');
  });
});
