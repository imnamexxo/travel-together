import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAuth } from './validation.ts';

test('login requires an email and password without applying new-account password policy', () => {
  assert.deepEqual(Object.keys(validateAuth({ email: '', password: '', name: '', confirmation: '' }, false)).sort(), ['email', 'password']);
  assert.ok(validateAuth({ email: 'invalid-address', password: 'password', name: '', confirmation: '' }, false).email);
  assert.deepEqual(validateAuth({ email: ' user@example.com ', password: 'short', name: '', confirmation: '' }, false), {});
});

test('signup checks name, minimum password length and exact confirmation', () => {
  const valid = { email: 'user@example.com', password: 'example-pass', name: '민지', confirmation: 'example-pass', ageConfirmed: true };
  assert.deepEqual(validateAuth(valid, true), {});
  assert.ok(validateAuth({ ...valid, name: '  ' }, true).name);
  assert.ok(validateAuth({ ...valid, password: 'short', confirmation: 'short' }, true).password);
  assert.ok(validateAuth({ ...valid, confirmation: 'example-pass ' }, true).confirmation);
  assert.ok(validateAuth({ ...valid, confirmation: '' }, true).confirmation);
});

test('signup requires confirming the user is at least 14', () => {
  const valid = { email: 'user@example.com', password: 'example-pass', name: '민지', confirmation: 'example-pass' };
  assert.ok(validateAuth(valid, true).age);
  assert.ok(validateAuth({ ...valid, ageConfirmed: false }, true).age);
  assert.equal(validateAuth({ ...valid, ageConfirmed: true }, true).age, undefined);
  assert.equal(validateAuth({ email: 'user@example.com', password: 'x', name: '', confirmation: '' }, false).age, undefined);
});
