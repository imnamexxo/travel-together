import assert from 'node:assert/strict';
import test from 'node:test';
import { expenses, members, snapshots, suggestedTransfers, totalExpense } from './preview-data.ts';

test('confirmed fixture totals and every item share agree', () => {
  assert.equal(expenses.reduce((sum, expense) => sum + expense.amount, 0), totalExpense);
  for (const expense of expenses) {
    assert.equal(expense.lines.reduce((sum, line) => sum + line.amount, 0), expense.amount);
    for (const line of expense.lines) {
      assert.equal(Object.values(line.shares).reduce((sum, value) => sum + value, 0), line.amount);
      for (const [id, amount] of Object.entries(line.shares)) {
        assert.ok(members.some((member) => member.id === id));
        assert.ok(Number.isSafeInteger(amount) && amount >= 0);
      }
    }
  }
  for (const member of members) {
    assert.equal(expenses.filter((expense) => expense.payer === member.id).reduce((sum, expense) => sum + expense.amount, 0), member.paid);
    assert.equal(expenses.flatMap((expense) => expense.lines).reduce((sum, line) => sum + (line.shares[member.id] ?? 0), 0), member.owed);
  }
});

test('all preview transfer states preserve balances, including undo and out-of-order recording', () => {
  for (const [key, snapshot] of Object.entries(snapshots)) {
    assert.equal(Object.values(snapshot).reduce((sum, value) => sum + value, 0), 0);
    for (const member of members) {
      let expected = member.paid - member.owed;
      suggestedTransfers.forEach((transfer, index) => {
        if (key[index] !== '1') return;
        if (transfer.from === member.id) expected += transfer.amount;
        if (transfer.to === member.id) expected -= transfer.amount;
      });
      assert.equal(snapshot[member.id], expected);
    }
  }
  assert.ok(Object.values(snapshots['11']).every((balance) => balance === 0));
});
