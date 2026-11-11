import { expect, test } from '@playwright/test';
import { type Account, CUBank, MSG, createAccount, expectAppMessage } from './support/cubank';

const amountCases = [
  { id: 'TC06_001', title: 'Amount is more than the balance', eq: 'Bill09: BT1, BA5', amount: '1001', expected: MSG.notEnough.bill },
  { id: 'TC06_002', title: 'Amount is 0', eq: 'Bill08: BT1, BA4', amount: '0', expected: MSG.amount.notPositive },
  { id: 'TC06_003', title: 'Amount has decimals', eq: 'Bill07: BT1, BA3', amount: '11.5', expected: MSG.amount.notWhole },
  { id: 'TC06_004', title: 'Amount is not a number', eq: 'Bill06: BT1, BA2', amount: 'a', expected: MSG.amount.notNumber },
];

test.describe('Scenario 6: Login passes, bill payment fails', () => {
  let bank: CUBank;
  let account: Account;

  test.beforeEach(async ({ page, request }) => {
    bank = new CUBank(page);
    account = await test.step('Pre-condition: a registered account with balance 1000', () =>
      createAccount(request, { balance: 1000 }),
    );
    await test.step(`Log in as ${account.accountId} (LA1, LP1)`, () => bank.loginAs(account));
  });

  async function expectNothingPaid() {
    await test.step('Post-condition: balance still 1000, no bill payment in history', async () => {
      await bank.expectBalance(1000);
      await bank.expectHistoryCount(1);
    });
  }

  for (const c of amountCases) {
    test(`${c.id} Pay the water bill: ${c.title} (${c.eq})`, async () => {
      await test.step(`Pick Water Charge, amount "${c.amount}"`, () => bank.fillBillPayment('water', c.amount));
      const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('billpayment'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await expectNothingPaid();
    });
  }

  test('TC06_005 No bill type selected (Bill04: BT4, BA1)', async () => {
    await test.step('Leave the bill type empty, amount 100', () => bank.fillBillPayment(null, '100'));
    const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('billpayment'));

    await test.step('Expected output: the form is not sent until a bill type is picked', () => {
      expect(outcome.shownBy, `the user saw: ${outcome.text}`).toBe('browser');
    });
    await expectNothingPaid();
  });

  test('TC06_006 Only one bill type can be selected (Bill05: BT5, BA1)', async () => {
    await test.step('Pick Water Charge, then Electric Charge, amount 100', async () => {
      await bank.fillBillPayment('water', '100');
      await bank.billRadio('electric').check();
    });
    await test.step('Expected output: only Electric Charge stays selected', async () => {
      await expect(bank.billRadio('electric')).toBeChecked();
      await expect(bank.billRadio('water')).not.toBeChecked();
      await expect(bank.billRadio('phone')).not.toBeChecked();
    });
    await expectNothingPaid();
  });
});
