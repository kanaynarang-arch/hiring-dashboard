import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryAddress, isMesaTestAddress, testModeRecipient } from '../src/lib/send';

test('MESA allow-list accepts the test domain and subdomains only', () => {
  assert.equal(isMesaTestAddress('squad_1@pg27.mesaschool.co'), true);
  assert.equal(isMesaTestAddress('x@mesaschool.co'), true);
  assert.equal(isMesaTestAddress('x@evilmesaschool.co'), false);
  assert.equal(isMesaTestAddress('x@mesaschool.co.evil.com'), false);
  assert.equal(isMesaTestAddress('x@gmail.com'), false);
  assert.equal(isMesaTestAddress(null), false);
});

test('without test mode the stored candidate address is used', () => {
  delete process.env.EMAIL_TEST_RECIPIENT;
  assert.equal(testModeRecipient(), null);
  assert.equal(deliveryAddress('squad_1@pg27.mesaschool.co'), 'squad_1@pg27.mesaschool.co');
});

test('test mode redirects delivery, and a non-MESA override is still refused by the allow-list', () => {
  process.env.EMAIL_TEST_RECIPIENT = 'owner@pg27.mesaschool.co';
  assert.equal(deliveryAddress('anyone@example.org'), 'owner@pg27.mesaschool.co');
  process.env.EMAIL_TEST_RECIPIENT = 'owner@example.org';
  assert.equal(isMesaTestAddress(deliveryAddress('squad_1@pg27.mesaschool.co')), false);
  delete process.env.EMAIL_TEST_RECIPIENT;
});
