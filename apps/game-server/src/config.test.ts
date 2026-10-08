import { expect, it } from 'vitest';
import { loadConfig } from './config';

const base = { AUTH_SECRET: 'test-secret-test-secret-test-secret!', NODE_ENV: 'test' };

it('validates content/combat flags and defaults to the production starter kit', () => {
  expect(loadConfig(base)).toMatchObject({
    COMBAT_CONTENT: 'starter',
    COMBAT_RULESET: 'elements_v1',
  });
  expect(() => loadConfig({ ...base, COMBAT_RULESET: 'unknown' })).toThrow();
  expect(() => loadConfig({ ...base, COMBAT_CONTENT: 'unknown' })).toThrow();
});
it('permits classic combat rollback in production but rejects granting the debug kit', () => {
  expect(loadConfig({ ...base, NODE_ENV: 'production', COMBAT_RULESET: 'classic' })).toMatchObject({
    COMBAT_CONTENT: 'starter',
    COMBAT_RULESET: 'classic',
  });
  expect(() =>
    loadConfig({ ...base, NODE_ENV: 'production', COMBAT_CONTENT: 'prototype' }),
  ).toThrow();
});
