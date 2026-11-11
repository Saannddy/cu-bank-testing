import { test } from '@playwright/test';
import { CUBank, createAccount } from './support/cubank';

const PASSWORD = '0427';

test.describe('Scenario 8: Login, deposit, withdrawal and transfer all pass', () => {
  test('TC08_001 Transfer between two accounts succeeds (Transfer01: TA1, TT1)', async ({ page, request }) => {
    const bank = new CUBank(page);
    const sender = await test.step('Pre-condition: a registered sender with balance 0', () =>
      createAccount(request, { password: PASSWORD }),
    );
    const recipient = await test.step('Pre-condition: a registered recipient with balance 0', () =>
      createAccount(request, { password: PASSWORD }),
    );

    await test.step(`Log in as ${sender.accountId} (LA1, LP1)`, () => bank.loginAs(sender));

    await test.step('Deposit 100: balance 100 (DA1)', async () => {
      await bank.fillDeposit('100');
      await bank.submitAndExpectBalance('deposit', 100);
      await bank.expectLastTransaction({ title: 'deposit', amount: 100, balance: 100 });
    });

    await test.step('Withdraw 20: balance 80 (WA1)', async () => {
      await bank.fillWithdraw('20');
      await bank.submitAndExpectBalance('withdraw', 80);
      await bank.expectLastTransaction({ title: 'withdraw', amount: 20, balance: 80 });
    });

    await test.step(`Transfer 20 to ${recipient.accountId}: balance 60`, async () => {
      await bank.fillTransfer(recipient.accountId, '20');
      await bank.submitAndExpectBalance('transfer', 60);
    });

    await test.step('Post-condition: sender history has 3 entries, the last is "transfer to"', async () => {
      await bank.expectHistoryCount(3);
      await bank.expectLastTransaction({ title: 'transfer to', target: recipient.accountId, amount: 20, balance: 60 });
    });

    await test.step('Log out', () => bank.logout());

    await test.step(`Post-condition: recipient ${recipient.accountId} has 20 and a "transfer from" entry`, async () => {
      await bank.loginAs(recipient);
      await bank.expectBalance(20);
      await bank.expectHistoryCount(1);
      await bank.expectLastTransaction({ title: 'transfer from', target: sender.accountId, amount: 20, balance: 20 });
    });
  });
});
