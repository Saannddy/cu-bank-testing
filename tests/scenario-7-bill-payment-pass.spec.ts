import { test } from '@playwright/test';
import { type Account, type BillType, CUBank, createAccount } from './support/cubank';

const cases: { id: string; type: BillType; label: string; eq: string }[] = [
  { id: 'TC07_001', type: 'water', label: 'Water Charge', eq: 'Bill01: BT1, BA1' },
  { id: 'TC07_002', type: 'electric', label: 'Electric Charge', eq: 'Bill02: BT2, BA1' },
  { id: 'TC07_003', type: 'phone', label: 'Phone Charge', eq: 'Bill03: BT3, BA1' },
];

test.describe('Scenario 7: Login passes, bill payment passes', () => {
  let bank: CUBank;
  let account: Account;

  test.beforeEach(async ({ page, request }) => {
    bank = new CUBank(page);
    account = await test.step('Pre-condition: a registered account with balance 1000', () =>
      createAccount(request, { balance: 1000 }),
    );
    await test.step(`Log in as ${account.accountId} (LA1, LP1)`, () => bank.loginAs(account));
  });

  for (const c of cases) {
    test(`${c.id} Pay the ${c.label} bill (${c.eq})`, async () => {
      await test.step(`Pick ${c.label}, amount 100`, () => bank.fillBillPayment(c.type, '100'));
      await test.step('Press Confirm: balance goes from 1000 to 900', () =>
        bank.submitAndExpectBalance('billpayment', 900),
      );
      await test.step(`Post-condition: history shows billpayment, target ${c.type}, amount 100, balance 900`, async () => {
        await bank.expectHistoryCount(2);
        await bank.expectLastTransaction({ title: 'billpayment', target: c.type, amount: 100, balance: 900 });
      });
    });
  }
});
