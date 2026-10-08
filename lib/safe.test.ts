// Run with: node --test lib/safe.test.ts
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {exactEth, formatEth, isAddress, toWei, withdrawTx} from './safe.ts';

test('toWei shifts 18 places and rejects junk', () => {
  assert.equal(toWei('0.005'), 5000000000000000n);
  assert.equal(toWei('1'), 10n ** 18n);
  assert.equal(toWei('.1'), 10n ** 17n);
  assert.equal(toWei(' 0.000000000000000001 '), 1n);
  for (const bad of ['', '0', 'abc', '1.2.3', '-1', '1e18', '0.0000000000000000001']) assert.equal(toWei(bad), null, bad);
});

test('withdraw data matches the call that worked on chain', () => {
  const tx = withdrawTx('0xa', '0xb', 5000000000000000n);
  assert.equal(tx.data, '0x2e1a7d4d0000000000000000000000000000000000000000000000000011c37937e08000');
});

test('formatEth and isAddress', () => {
  assert.equal(formatEth(5000000000000000n), '0.0050');
  assert.equal(isAddress('0x7CceE0E63eFa28c24A0EEe6C408f984376EfAbDe'), true);
  assert.equal(isAddress('0x123'), false);
});

test('exactEth round-trips through toWei without rounding', () => {
  assert.equal(exactEth(4000000000000000n), '0.004');
  assert.equal(exactEth(10n ** 18n), '1');
  assert.equal(exactEth(0n), '0');
  for (const wei of [1n, 43003180482694231n, 12n * 10n ** 18n + 5n]) assert.equal(toWei(exactEth(wei)), wei);
});
