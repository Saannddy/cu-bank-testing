import { test } from '@playwright/test';
import { CUBank, MSG, createAccount, expectAppMessage } from './support/cubank';

test.describe('Scenario 4: Login and deposit pass, withdrawal fails (balance not enough)', () => {
  test('TC04_001 Withdraw more than the balance (WA5)', async ({ page, request }) => {
    const bank = new CUBank(page);
    const account = await test.step('Pre-condition: a registered account with balance 0', () =>
      createAccount(request),
    );

    await test.step(`Log in as ${account.accountId} (LA1, LP1)`, () => bank.loginAs(account));
    await test.step('Deposit 100: balance 100 (DA1)', async () => {
      await bank.fillDeposit('100');
      await bank.submitAndExpectBalance('deposit', 100);
      await bank.expectLastTransaction({ title: 'deposit', amount: 100, balance: 100 });
    });

    await test.step('Withdraw 1000', () => bank.fillWithdraw('1000'));
    const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('withdraw'));

    await test.step('Expected output: error message', () => expectAppMessage(outcome, MSG.notEnough.withdraw));
    await test.step('Post-condition: balance still 100, history has only the deposit', async () => {
      await bank.expectBalance(100);
      await bank.expectHistoryCount(1);
    });
  });
});
