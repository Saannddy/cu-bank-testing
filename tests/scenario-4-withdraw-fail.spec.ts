import { test } from '@playwright/test';
import { type Account, CUBank, MSG, createAccount, expectAppMessage } from './support/cubank';

// Scenario 4: Login passes, deposit passes, then the withdrawal fails because
// the balance is not enough (EQ class WA5). The requirements say the amount
// must be *less than* the balance, so withdrawing the whole balance must fail too.

const cases = [
  { id: 'TC04_001', title: 'Withdraw more than the balance', amount: 1000 },
  { id: 'TC04_002', title: 'Withdraw exactly the whole balance', amount: 100 },
];

test.describe('Scenario 4: Login and deposit pass, withdrawal fails (balance not enough)', () => {
  let bank: CUBank;
  let account: Account;

  test.beforeEach(async ({ page, request }) => {
    bank = new CUBank(page);
    account = await test.step('Pre-condition: a registered account with balance 0', () => createAccount(request));
    await test.step(`Log in as ${account.accountId}`, () => bank.loginAs(account));
    await test.step('Deposit 100 (passes)', async () => {
      await bank.fillDeposit('100');
      await bank.submitAndExpectBalance('deposit', 100);
      await bank.expectLastTransaction({ title: 'deposit', amount: 100, balance: 100 });
    });
  });

  for (const c of cases) {
    test(`${c.id} ${c.title} (LA1, LP1, DA1, WA5)`, async () => {
      await test.step(`Withdraw ${c.amount} from a balance of 100`, () => bank.fillWithdraw(String(c.amount)));
      const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('withdraw'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, MSG.withdrawNotEnough));
      await test.step('Post-condition: balance still 100, history has only the deposit', async () => {
        await bank.expectBalance(100);
        await bank.expectHistoryCount(1);
      });
    });
  }
});
