import { expect, test } from '@playwright/test';
import { CUBank, MSG, PASSWORD, createAccount, expectAppMessage, unregisteredAccountId } from './support/cubank';

type LoginCase = {
  id: string;
  title: string;
  eq: string;
  account: { kind: 'registered' } | { kind: 'unregistered' } | { kind: 'typed'; value: string };
  password: string;
  expected: string;
};

const cases: LoginCase[] = [
  {
    id: 'TC02_001',
    title: 'Account number is not Arabic digits',
    eq: 'Login02: LA2, LP1',
    account: { kind: 'typed', value: '123456789A' },
    password: PASSWORD,
    expected: MSG.login.accountNumbersOnly,
  },
  {
    id: 'TC02_002',
    title: 'Account number is not registered',
    eq: 'Login04: LA4, LP1',
    account: { kind: 'unregistered' },
    password: PASSWORD,
    expected: MSG.login.userNotFound,
  },
  {
    id: 'TC02_003',
    title: 'Account number has fewer than 10 digits',
    eq: 'Login03: LA3, LP1',
    account: { kind: 'typed', value: '123456789' },
    password: PASSWORD,
    expected: MSG.login.accountTenDigits,
  },
  {
    id: 'TC02_004',
    title: 'Password is not Arabic digits',
    eq: 'Login05: LA1, LP2',
    account: { kind: 'registered' },
    password: 'pass',
    expected: MSG.login.passwordNumbersOnly,
  },
  {
    id: 'TC02_005',
    title: 'Password has fewer than 4 digits',
    eq: 'Login06: LA1, LP3',
    account: { kind: 'registered' },
    password: '123',
    expected: MSG.login.passwordFourDigits,
  },
  {
    id: 'TC02_006',
    title: 'Password does not match the account',
    eq: 'Login07: LA1, LP4',
    account: { kind: 'registered' },
    password: '0123',
    expected: MSG.login.wrongPassword,
  },
];

test.describe('Scenario 2: Login fails', () => {
  for (const c of cases) {
    test(`${c.id} ${c.title} (${c.eq})`, async ({ page, request }) => {
      const bank = new CUBank(page);
      let accountId: string;
      switch (c.account.kind) {
        case 'registered':
          accountId = (
            await test.step(`Pre-condition: an account is registered with password ${PASSWORD}`, () =>
              createAccount(request),
            )
          ).accountId;
          break;
        case 'unregistered':
          accountId = await test.step('Pre-condition: the account number is not registered', () =>
            unregisteredAccountId(request),
          );
          break;
        case 'typed':
          accountId = c.account.value;
          break;
      }

      await test.step(`Fill in ${accountId} / ${c.password}`, () => bank.fillLogin(accountId, c.password));
      const outcome = await test.step('Press Login', () => bank.submitExpectingRejection('login'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await test.step('Post-condition: still on the Login page and logged out', async () => {
        await expect(page).toHaveURL(/localhost:3000\/$/);
        await bank.expectLoggedOut();
      });
    });
  }
});
