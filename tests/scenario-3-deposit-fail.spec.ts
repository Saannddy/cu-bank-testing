import { test } from '@playwright/test';
import { type Account, CUBank, MSG, createAccount, expectAppMessage } from './support/cubank';

const cases = [
  { id: 'TC03_001', title: 'Deposit a negative amount', eq: 'Deposit04: DA4', amount: '-100', expected: MSG.amount.notPositive },
  { id: 'TC03_002', title: 'Deposit an amount with decimals', eq: 'Deposit03: DA3', amount: '99.99', expected: MSG.amount.notWhole },
  { id: 'TC03_003', title: 'Deposit an amount that is not a number', eq: 'Deposit02: DA2', amount: 'abc', expected: MSG.amount.notNumber },
];

test.describe('Scenario 3: Login passes, deposit fails', () => {
  let bank: CUBank;
  let account: Account;

  test.beforeEach(async ({ page, request }) => {
    bank = new CUBank(page);
    account = await test.step('Pre-condition: a registered account with balance 0', () => createAccount(request));
    await test.step(`Log in as ${account.accountId} (LA1, LP1)`, () => bank.loginAs(account));
  });

  for (const c of cases) {
    test(`${c.id} ${c.title} (${c.eq})`, async () => {
      await test.step(`Deposit "${c.amount}"`, () => bank.fillDeposit(c.amount));
      const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('deposit'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await test.step('Post-condition: balance still 0, no history', async () => {
        await bank.expectBalance(0);
        await bank.expectHistoryCount(0);
      });
    });
  }
});
