import { expect, test } from '@playwright/test';
import { CUBank, MSG, accountExists, createAccount, expectAppMessage, newAccountId } from './support/cubank';

// Scenario 1: Register fails.
// Each case fills the Register form with one invalid input (weak robust EQ
// cases Regist02–Regist07) and checks the error message, that the user stays
// on the Register page, and that no account was created.

const cases = [
  {
    id: 'TC01_001',
    title: 'First + last name longer than 30 characters',
    eq: 'RA1, RP1, RF2',
    firstName: 'verylongfirstname',
    lastName: 'verylonglastname',
    expected: MSG.fullNameTooLong,
  },
  { id: 'TC01_002', title: 'Password has only 3 digits', eq: 'RA1, RP2, RF1', password: '012', expected: MSG.passwordFourDigits },
  { id: 'TC01_003', title: 'Password contains letters and symbols', eq: 'RA1, RP3, RF1', password: 'O!Z3', expected: MSG.passwordNumbersOnly },
  { id: 'TC01_005', title: 'Account number has only 9 digits', eq: 'RA3, RP1, RF1', accountId: '012345678', expected: MSG.accountTenDigits },
  { id: 'TC01_006', title: 'Account number contains letters', eq: 'RA4, RP1, RF1', accountId: 'OIZ34N67B9', expected: MSG.accountNumbersOnly },
];

test.describe('Scenario 1: Register fails', () => {
  for (const c of cases) {
    test(`${c.id} ${c.title} (${c.eq})`, async ({ page, request }) => {
      const bank = new CUBank(page);
      const form = {
        accountId: c.accountId ?? newAccountId(),
        password: c.password ?? '0123',
        firstName: c.firstName ?? 'Sam',
        lastName: c.lastName ?? 'Son',
      };

      await test.step('Open the Register page', () => bank.openRegister());
      await test.step(`Fill in ${form.accountId} / ${form.password} / ${form.firstName} ${form.lastName}`, () =>
        bank.fillRegister(form),
      );
      const outcome = await test.step('Press Register', () => bank.submitExpectingRejection('register'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await test.step('Post-condition: still on Register, no account created', async () => {
        await expect(page).toHaveURL(/\/register$/);
        if (/^\d{10}$/.test(form.accountId)) {
          expect(await accountExists(request, form.accountId), 'account was created').toBe(false);
        }
      });
    });
  }

  test('TC01_004 Account number is already in use (RA2, RP1, RF1)', async ({ page, request }) => {
    const bank = new CUBank(page);
    const existing = await test.step('Pre-condition: the account number is already registered', () =>
      createAccount(request),
    );

    await test.step('Open the Register page', () => bank.openRegister());
    await test.step(`Fill in the same account number ${existing.accountId}`, () =>
      bank.fillRegister({ accountId: existing.accountId, password: '0123', firstName: 'Sam', lastName: 'Son' }),
    );
    const outcome = await test.step('Press Register', () => bank.submitExpectingRejection('register'));

    await test.step('Expected output: error message', () => expectAppMessage(outcome, MSG.accountInUse));
    await test.step('Post-condition: still on Register', () => expect(page).toHaveURL(/\/register$/));
  });
});
