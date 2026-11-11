import { expect, test } from '@playwright/test';
import { CUBank, MSG, accountExists, createAccount, expectAppMessage, newAccountId } from './support/cubank';

type RegisterCase = {
  id: string;
  title: string;
  eq: string;
  account: { kind: 'unused' } | { kind: 'registered' } | { kind: 'typed'; value: string };
  password: string;
  firstName: string;
  lastName: string;
  expected: string;
};

const cases: RegisterCase[] = [
  {
    id: 'TC01_001',
    title: 'First name + last name longer than 30 characters',
    eq: 'Regist02: RA1, RP1, RF2',
    account: { kind: 'unused' },
    password: '1234',
    firstName: 'verylongfirstname',
    lastName: 'verylonglastname',
    expected: MSG.register.fullNameTooLong,
  },
  {
    id: 'TC01_002',
    title: 'Password has fewer than 4 digits',
    eq: 'Regist03: RA1, RP2, RF1',
    account: { kind: 'unused' },
    password: '123',
    firstName: 'Tester',
    lastName: 'Corgi',
    expected: MSG.register.passwordFourDigits,
  },
  {
    id: 'TC01_003',
    title: 'Password is not Arabic digits',
    eq: 'Regist04: RA1, RP3, RF1',
    account: { kind: 'unused' },
    password: '๑๒๓๔',
    firstName: 'Tester',
    lastName: 'Corgi',
    expected: MSG.register.passwordNumbersOnly,
  },
  {
    id: 'TC01_004',
    title: 'Account number is already registered',
    eq: 'Regist05: RA2, RP1, RF1',
    account: { kind: 'registered' },
    password: '1234',
    firstName: 'Tester',
    lastName: 'Corgi',
    expected: MSG.register.accountInUse,
  },
  {
    id: 'TC01_005',
    title: 'Account number has fewer than 10 digits',
    eq: 'Regist06: RA3, RP1, RF1',
    account: { kind: 'typed', value: '012345678' },
    password: '1234',
    firstName: 'Tester',
    lastName: 'Corgi',
    expected: MSG.register.accountTenDigits,
  },
  {
    id: 'TC01_006',
    title: 'Account number is not Arabic digits',
    eq: 'Regist07: RA4, RP1, RF1',
    account: { kind: 'typed', value: '๑๒๓@#$%:”)((' },
    password: '1234',
    firstName: 'Tester',
    lastName: 'Corgi',
    expected: MSG.register.accountNumbersOnly,
  },
];

test.describe('Scenario 1: Register fails', () => {
  for (const c of cases) {
    test(`${c.id} ${c.title} (${c.eq})`, async ({ page, request }) => {
      const bank = new CUBank(page);
      let accountId: string;
      switch (c.account.kind) {
        case 'unused':
          accountId = newAccountId();
          break;
        case 'registered':
          accountId = (
            await test.step('Pre-condition: the account number is already registered', () => createAccount(request))
          ).accountId;
          break;
        case 'typed':
          accountId = c.account.value;
          break;
      }
      const form = { accountId, password: c.password, firstName: c.firstName, lastName: c.lastName };

      await test.step('Open the Register page', () => bank.openRegister());
      await test.step(`Fill in ${form.accountId} / ${form.password} / ${form.firstName} ${form.lastName}`, () =>
        bank.fillRegister(form),
      );
      const outcome = await test.step('Press Register', () => bank.submitExpectingRejection('register'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await test.step('Post-condition: still on the Register page, no new account', async () => {
        await expect(page).toHaveURL(/\/register$/);
        if (c.account.kind === 'unused') {
          expect(await accountExists(request, accountId), 'account was created').toBe(false);
        }
      });
    });
  }
});
