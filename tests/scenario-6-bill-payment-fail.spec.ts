import { expect, test } from '@playwright/test';
import { type Account, CUBank, MSG, createAccount, expectAppMessage } from './support/cubank';

// Scenario 6: Login passes, then the bill payment fails.
// The user has a balance of 1000 and tries a bill payment with no bill type
// or an invalid amount (EQ cases Bill04–Bill09). The balance must not change.

test.describe('Scenario 6: Login passes, bill payment fails', () => {
  let bank: CUBank;
  let account: Account;

  test.beforeEach(async ({ page, request }) => {
    bank = new CUBank(page);
    account = await test.step('Pre-condition: a registered account with balance 1000', () =>
      createAccount(request, { balance: 1000 }),
    );
    await test.step(`Log in as ${account.accountId}`, () => bank.loginAs(account));
  });

  async function expectNothingPaid() {
    await test.step('Post-condition: balance still 1000, no bill payment in history', async () => {
      await bank.expectBalance(1000);
      await bank.expectHistoryCount(1); // the opening deposit
    });
  }

  test('TC06_001 No bill type selected (BT4, BA1)', async () => {
    await test.step('Leave the bill type empty, amount 100', () => bank.fillBillPayment(null, '100'));
    const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('billpayment'));

    await test.step('Expected output: the form is not submitted until a bill type is picked', () => {
      expect(outcome.shownBy, `the user saw: ${outcome.text}`).toBe('browser');
    });
    await expectNothingPaid();
  });

  test('TC06_002 Only one bill type can be selected (BT5)', async () => {
    await test.step('Pick Water, then Electric', async () => {
      await bank.billRadio('water').check();
      await bank.billRadio('electric').check();
    });
    await test.step('Expected output: only Electric stays selected', async () => {
      await expect(bank.billRadio('electric')).toBeChecked();
      await expect(bank.billRadio('water')).not.toBeChecked();
      await expect(bank.billRadio('phone')).not.toBeChecked();
    });
    await expectNothingPaid();
  });

  const amountCases = [
    { id: 'TC06_003', title: 'Amount is not a number', eq: 'BT1, BA2', amount: 'a', expected: MSG.amountNotNumber },
    { id: 'TC06_004', title: 'Amount has decimals', eq: 'BT1, BA3', amount: '10.5', expected: MSG.amountNotWhole },
    { id: 'TC06_005', title: 'Amount is 0', eq: 'BT1, BA4', amount: '0', expected: MSG.amountNotPositive },
    { id: 'TC06_006', title: 'Amount is more than the balance', eq: 'BT1, BA5', amount: '1001', expected: MSG.billNotEnough },
    { id: 'TC06_007', title: 'Amount equals the whole balance', eq: 'BT1, BA5', amount: '1000', expected: MSG.billNotEnough },
  ];

  for (const c of amountCases) {
    test(`${c.id} ${c.title} (${c.eq})`, async () => {
      await test.step(`Pay the water bill, amount "${c.amount}"`, () => bank.fillBillPayment('water', c.amount));
      const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('billpayment'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await expectNothingPaid();
    });
  }
});
