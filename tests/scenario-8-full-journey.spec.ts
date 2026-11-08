import { expect, test } from '@playwright/test';
import { CUBank, PASSWORD, createAccount, newAccountId } from './support/cubank';

// Scenario 8 (our own): register, log in, deposit, withdraw and transfer, all
// passing. Then log in as the recipient and check the money arrived.
// Covers RA1, RP1, RF1, LA1, LP1, DA1, WA1, TA1, TT1.

test.describe('Scenario 8: Register, log in, deposit, withdraw and transfer all pass', () => {
  test('TC08_001 Transfer between two accounts succeeds', async ({ page, request }) => {
    const bank = new CUBank(page);
    const recipient = await test.step('Pre-condition: a recipient account with balance 0', () =>
      createAccount(request),
    );
    const sender = { accountId: newAccountId(), password: PASSWORD, name: 'Sam Son' };

    await test.step(`Register ${sender.accountId}`, async () => {
      await bank.openRegister();
      await bank.fillRegister({ accountId: sender.accountId, password: sender.password, firstName: 'Sam', lastName: 'Son' });
      const popup = await bank.submitRegistration();
      expect(popup.toLowerCase()).toContain('success');
      await expect(page).toHaveURL(/localhost:3000\/$/);
    });

    await test.step(`Log in as ${sender.accountId}`, () => bank.loginAs(sender));

    await test.step('Deposit 100: balance 100', async () => {
      await bank.fillDeposit('100');
      await bank.submitAndExpectBalance('deposit', 100);
      await bank.expectLastTransaction({ title: 'deposit', amount: 100, balance: 100 });
    });

    await test.step('Withdraw 20: balance 80', async () => {
      await bank.fillWithdraw('20');
      await bank.submitAndExpectBalance('withdraw', 80);
      await bank.expectLastTransaction({ title: 'withdraw', amount: 20, balance: 80 });
    });

    await test.step(`Transfer 20 to ${recipient.accountId}: balance 60`, async () => {
      await bank.fillTransfer(recipient.accountId, '20');
      await bank.submitAndExpectBalance('transfer', 60);
      await bank.expectHistoryCount(3);
      await bank.expectLastTransaction({ title: 'transfer to', target: recipient.accountId, amount: 20, balance: 60 });
    });

    await test.step('Log out', () => bank.logout());

    await test.step(`Log in as the recipient ${recipient.accountId}: balance 20, history shows the transfer`, async () => {
      await bank.loginAs(recipient);
      await bank.expectBalance(20);
      await bank.expectHistoryCount(1);
      await bank.expectLastTransaction({ title: 'transfer from', target: sender.accountId, amount: 20, balance: 20 });
    });
  });
});
