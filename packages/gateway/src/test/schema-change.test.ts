import assert from 'assert';
import test from 'node:test';
import { diffSchemas } from '../utils/schema-diff';

test('schema diff utility: unchanged', () => {
  const sdl = 'type Query { a: String }';
  const r = diffSchemas(sdl, sdl);
  assert.equal(r, null);
});

test('schema diff utility: first version', () => {
  const sdl = 'type Query { a: String }';
  const r = diffSchemas(null, sdl);
  assert.ok(r);
  assert.equal(r?.previousHash, null);
  assert.ok(r?.diff.split('\n').every((l) => l.startsWith('+ ')));
});

test('schema diff utility: changed', () => {
  const oldSDL = 'type Query { a: String }';
  const newSDL = 'type Query { a: String b: Int }';
  const r = diffSchemas(oldSDL, newSDL);
  assert.ok(r);
  assert.notStrictEqual(r?.previousHash, r?.newHash);
  assert.ok(r?.diff.includes('+ type Query { a: String b: Int }') || r?.diff.includes('+ b: Int'));
});

test('classification heuristic precondition: only additions produce no deletions', () => {
  const r = diffSchemas('type Query { a: String }', 'type Query { a: String b: Int }');
  assert.ok(r);
  const hasDeletion = r!.diff.split('\n').some((l) => l.startsWith('- '));
  assert.equal(hasDeletion, false);
});

test('classification heuristic precondition: deletions present', () => {
  const r = diffSchemas('type Query { a: String b: Int }', 'type Query { a: String }');
  assert.ok(r);
  const hasDeletion = r!.diff.split('\n').some((l) => l.startsWith('- '));
  assert.equal(hasDeletion, true);
});
