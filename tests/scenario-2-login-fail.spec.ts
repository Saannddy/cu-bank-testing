import { expect, test } from '@playwright/test';
import { CUBank, MSG, PASSWORD, createAccount, expectAppMessage, newAccountId } from './support/cubank';

// Scenario 2: Login fails.
// A registered account exists. Each case logs in with one invalid input
// (weak robust EQ cases Login02–Login07) and checks the error message and
// that the user is still logged out.

type LoginCase = {
  id: string;
  title: string;
  eq: string;
  /** Builds the account number and password to type, from the registered account. */
  input: (registered: string) => { accountId: string; password: string };
  expected: string;
};

const cases: LoginCase[] = [
  {
    id: 'TC02_001',
    title: 'Account number contains a letter',
    eq: 'LA2, LP1',
    input: (registered) => ({ accountId: registered.slice(0, 9) + 'A', password: PASSWORD }),
    expected: MSG.accountNumbersOnly,
  },
  {
    id: 'TC02_002',
    title: 'Account number has only 9 digits',
    eq: 'LA3, LP1',
    input: (registered) => ({ accountId: registered.slice(0, 9), password: PASSWORD }),
    expected: MSG.accountTenDigits,
  },
  {
    id: 'TC02_003',
    title: 'Account number is not registered',
    eq: 'LA4, LP1',
    input: () => ({ accountId: newAccountId(), password: PASSWORD }),
    expected: MSG.userNotFound,
  },
  {
    id: 'TC02_004',
    title: 'Password contains letters and symbols',
    eq: 'LA1, LP2',
    input: (registered) => ({ accountId: registered, password: 'O!Z3' }),
    expected: MSG.passwordNumbersOnly,
  },
  {
    id: 'TC02_005',
    title: 'Password has 6 digits',
    eq: 'LA1, LP3',
    input: (registered) => ({ accountId: registered, password: '012345' }),
    expected: MSG.passwordFourDigits,
  },
  {
    id: 'TC02_006',
    title: 'Wrong password',
    eq: 'LA1, LP4',
    input: (registered) => ({ accountId: registered, password: '1233' }),
    expected: MSG.wrongPassword,
  },
];

test.describe('Scenario 2: Login fails', () => {
  for (const c of cases) {
    test(`${c.id} ${c.title} (${c.eq})`, async ({ page, request }) => {
      const bank = new CUBank(page);
      const account = await test.step(`Pre-condition: an account is registered with password ${PASSWORD}`, () =>
        createAccount(request),
      );
      const { accountId, password } = c.input(account.accountId);

      await test.step(`Fill in ${accountId} / ${password}`, () => bank.fillLogin(accountId, password));
      const outcome = await test.step('Press Login', () => bank.submitExpectingRejection('login'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await test.step('Post-condition: still on the Login page and logged out', async () => {
        await expect(page).toHaveURL(/localhost:3000\/$/);
        await bank.expectLoggedOut();
      });
    });
  }
});
