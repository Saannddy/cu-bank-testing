import { expect, test } from '@playwright/test';
import { type Account, CUBank, MSG, createAccount, expectAppMessage, fetchAccount, newAccountId } from './support/cubank';

// Scenario 5: Login, deposit and withdrawal pass, then the transfer fails.
// The sender deposits 100 and withdraws 20 (balance 80), then tries a transfer
// with a wrong target account (TC05_001–004) or a wrong amount (TC05_005–009).
// The sender's balance and history, and the recipient's balance, must not change.

type Target =
  | { kind: 'recipient' } // an existing account that isn't the sender's
  | { kind: 'unregistered' }
  | { kind: 'own' }
  | { kind: 'typed'; value: string };

const cases: { id: string; title: string; eq: string; target: Target; amount: string; expected: string }[] = [
  { id: 'TC05_001', title: 'Target account does not exist', eq: 'TA1, TT2', target: { kind: 'unregistered' }, amount: '20', expected: MSG.recipientNotFound },
  { id: 'TC05_002', title: 'Target account contains a letter', eq: 'TA1, TT5', target: { kind: 'typed', value: '123456789x' }, amount: '20', expected: MSG.accountNumbersOnly },
  { id: 'TC05_003', title: 'Target account has only 9 digits', eq: 'TA1, TT4', target: { kind: 'typed', value: '123456789' }, amount: '20', expected: MSG.accountTenDigits },
  { id: 'TC05_004', title: 'Transfer to your own account', eq: 'TA1, TT3', target: { kind: 'own' }, amount: '20', expected: MSG.ownAccount },
  { id: 'TC05_005', title: 'Amount is not a number', eq: 'TA2, TT1', target: { kind: 'recipient' }, amount: 'abc', expected: MSG.amountNotNumber },
  { id: 'TC05_006', title: 'Amount has decimals', eq: 'TA3, TT1', target: { kind: 'recipient' }, amount: '1.5', expected: MSG.amountNotWhole },
  { id: 'TC05_007', title: 'Amount is 0', eq: 'TA4, TT1', target: { kind: 'recipient' }, amount: '0', expected: MSG.amountNotPositive },
  { id: 'TC05_008', title: 'Amount is more than the balance', eq: 'TA5, TT1', target: { kind: 'recipient' }, amount: '81', expected: MSG.transferNotEnough },
  { id: 'TC05_009', title: 'Amount equals the whole balance', eq: 'TA5, TT1', target: { kind: 'recipient' }, amount: '80', expected: MSG.transferNotEnough },
];

test.describe('Scenario 5: Login, deposit and withdrawal pass, transfer fails', () => {
  let bank: CUBank;
  let sender: Account;

  test.beforeEach(async ({ page, request }) => {
    bank = new CUBank(page);
    sender = await test.step('Pre-condition: a registered sender with balance 0', () => createAccount(request));
    await test.step(`Log in as ${sender.accountId}`, () => bank.loginAs(sender));
    await test.step('Deposit 100 (passes)', async () => {
      await bank.fillDeposit('100');
      await bank.submitAndExpectBalance('deposit', 100);
    });
    await test.step('Withdraw 20 (passes)', async () => {
      await bank.fillWithdraw('20');
      await bank.submitAndExpectBalance('withdraw', 80);
    });
  });

  for (const c of cases) {
    test(`${c.id} ${c.title} (${c.eq})`, async ({ request }) => {
      let recipient: Account | undefined;
      let target: string;
      switch (c.target.kind) {
        case 'recipient':
          recipient = await test.step('Pre-condition: a recipient account with balance 0', () => createAccount(request));
          target = recipient.accountId;
          break;
        case 'unregistered':
          target = newAccountId();
          break;
        case 'own':
          target = sender.accountId;
          break;
        case 'typed':
          target = c.target.value;
          break;
      }

      await test.step(`Transfer "${c.amount}" to ${target}`, () => bank.fillTransfer(target, c.amount));
      const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('transfer'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await test.step('Post-condition: sender still has 80 and only 2 history entries', async () => {
        await bank.expectBalance(80);
        await bank.expectHistoryCount(2);
      });
      if (recipient) {
        const r = recipient;
        await test.step('Post-condition: recipient balance unchanged', async () => {
          expect((await fetchAccount(request, r)).balance, 'recipient balance').toBe(0);
        });
      }
    });
  }
});
