import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomInt } from 'node:crypto';

export const API_URL = 'http://localhost:4000/api/v1';
export const PASSWORD = '0427';

/** Error messages exactly as the requirements (instruction PDF) list them. */
export const MSG = {
  accountNumbersOnly: 'Your account ID should contain numbers only.',
  accountTenDigits: 'Your account ID must be exactly 10 digits long.',
  accountInUse: 'This account ID is already in use. Please choose another.',
  passwordNumbersOnly: 'Your password should contain numbers only.',
  passwordFourDigits: 'Your password must be exactly 4 digits long.',
  fullNameTooLong: 'Your fullname must be 30 characters or less, including spaces.',
  userNotFound: 'User not found. Please check your account ID.',
  wrongPassword: 'Incorrect password. Please try again.',
  amountNotNumber: 'Invalid balance amount. Please enter a valid number.',
  amountNotWhole: 'The balance amount must be a whole number with no decimals.',
  amountNotPositive: 'The amount must be greater than 0. Please enter a positive number.',
  withdrawNotEnough: 'Your balance is not enough to complete the withdrawal.',
  transferNotEnough: 'Your balance is not enough to complete the transfer.',
  billNotEnough: 'Your balance is not enough to complete the bill payment.',
  recipientNotFound: "We couldn't find the recipient's account. Please double-check the account ID.",
  ownAccount: 'You cannot transfer to your own account.',
} as const;

export interface Account {
  accountId: string;
  password: string;
  name: string;
}

export type BillType = 'water' | 'electric' | 'phone';

/** A random 10-digit account number, so every run works on fresh accounts. */
export function newAccountId(): string {
  return String(randomInt(1, 10)) + String(randomInt(0, 1_000_000_000)).padStart(9, '0');
}

// ---------------------------------------------------------------------------
// Pre-condition and post-condition helpers. These talk to the API directly:
// they set up or check data and are not part of the scenario being watched.
// ---------------------------------------------------------------------------

/** Register an account, and optionally deposit money into it, through the API. */
export async function createAccount(
  request: APIRequestContext,
  { balance = 0, accountId = newAccountId() }: { balance?: number; accountId?: string } = {},
): Promise<Account> {
  const account = { accountId, password: PASSWORD, name: 'John Tester' };
  const res = await request.post(`${API_URL}/auth/register`, { data: account });
  expect(res.ok(), `register ${accountId}: ${await res.text()}`).toBe(true);

  if (balance > 0) {
    const { token } = await res.json();
    const deposit = await request.put(`${API_URL}/transactions`, {
      data: { action: 'deposit', balance },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deposit.ok(), `deposit ${balance} into ${accountId}: ${await deposit.text()}`).toBe(true);
  }
  return account;
}

/** Balance and history of an account, read from the API. */
export async function fetchAccount(request: APIRequestContext, account: Account) {
  const login = await request.post(`${API_URL}/auth/login`, {
    data: { accountId: account.accountId, password: account.password },
  });
  expect(login.ok(), `log in as ${account.accountId}: ${await login.text()}`).toBe(true);
  const { token } = await login.json();
  const res = await request.get(`${API_URL}/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = await res.json();
  return data as { balance: number; transactions: { title: string; target: string; amount: number }[] };
}

/** Whether an account exists. Only works for a well-formed (10-digit) account number. */
export async function accountExists(request: APIRequestContext, accountId: string): Promise<boolean> {
  const res = await request.post(`${API_URL}/auth/login`, { data: { accountId, password: '0000' } });
  const body = await res.json();
  return !(res.status() === 400 && /User not found/.test(body.msg ?? ''));
}

// ---------------------------------------------------------------------------
// What the user saw after pressing a submit button.
// ---------------------------------------------------------------------------

type Form = 'register' | 'login' | 'deposit' | 'withdraw' | 'transfer' | 'billpayment';

const SUBMIT_BUTTON: Record<Form, string> = {
  register: 'rc',
  login: 'lc',
  deposit: 'dc',
  withdraw: 'wc',
  transfer: 'tc',
  billpayment: 'bc',
};

const ERROR_LABEL: Record<Form, string> = {
  register: 'register-error-mes',
  login: 'login-error-mes',
  deposit: 'deposite-error-mes', // sic: the app spells it this way
  withdraw: 'withdraw-error-mes',
  transfer: 'transfer-error-mes',
  billpayment: 'billpayment-error-mes',
};

const BILL_RADIO: Record<BillType, string> = { water: 'b1', electric: 'b2', phone: 'b3' };

export interface Outcome {
  /** "app" = the app's red error label, "browser" = the browser's own form check. */
  shownBy: 'app' | 'browser' | 'nothing';
  text: string;
}

const withoutFinalDot = (s: string) => s.trim().replace(/\.$/, '');

/**
 * Check that the app itself showed the expected message. A soft assertion:
 * the test goes on to check the post-condition and reports both at the end.
 */
export function expectAppMessage(outcome: Outcome, expected: string) {
  expect
    .soft(`${outcome.shownBy}: ${withoutFinalDot(outcome.text)}`, 'Message shown to the user')
    .toBe(`app: ${withoutFinalDot(expected)}`);
}

// ---------------------------------------------------------------------------
// The CU Bank UI.
// ---------------------------------------------------------------------------

export class CUBank {
  constructor(private readonly page: Page) {}

  get loginLink() {
    return this.page.getByRole('link', { name: 'LOG IN', exact: true });
  }
  get registerLink() {
    return this.page.getByRole('link', { name: 'Register', exact: true });
  }
  get logoutLink() {
    return this.page.getByRole('link', { name: 'LOG OUT', exact: true });
  }
  get balance() {
    return this.page.locator('h2:text-is("Balance:") + h1');
  }
  get history() {
    return this.page.locator('.history-list .account-form > div');
  }

  // Register ----------------------------------------------------------------

  async openRegister() {
    await this.page.goto('/');
    await this.registerLink.click();
    await expect(this.page).toHaveURL(/\/register$/);
  }

  async fillRegister(form: { accountId: string; password: string; firstName: string; lastName: string }) {
    await this.page.getByTestId('r1').fill(form.accountId);
    await this.page.getByTestId('r2').fill(form.password);
    await this.page.getByTestId('r3').fill(form.firstName);
    await this.page.getByTestId('r4').fill(form.lastName);
  }

  /** Press Register on a valid form; returns the text of the success pop-up. */
  async submitRegistration(): Promise<string> {
    let popup = '';
    this.page.once('dialog', async (dialog) => {
      popup = dialog.message();
      await dialog.accept();
    });
    await this.page.getByTestId(SUBMIT_BUTTON.register).click();
    await expect.poll(() => popup, { message: 'success pop-up' }).not.toBe('');
    return popup;
  }

  // Login / logout ----------------------------------------------------------

  async fillLogin(accountId: string, password: string) {
    await this.page.goto('/');
    await this.page.getByTestId('l1').fill(accountId);
    await this.page.getByTestId('l2').fill(password);
  }

  /** Log in and wait until the Account page has loaded the balance. */
  async loginAs(account: Account) {
    await this.fillLogin(account.accountId, account.password);
    await this.page.getByTestId(SUBMIT_BUTTON.login).click();
    await expect(this.page).toHaveURL(/\/account\/?$/);
    await this.expectLoggedIn();
    await expect(this.balance).toHaveText(/^\d+$/);
  }

  async expectLoggedIn() {
    await expect(this.logoutLink).toBeVisible();
    await expect(this.loginLink).toBeHidden();
    await expect(this.registerLink).toBeHidden();
  }

  async expectLoggedOut() {
    await expect(this.loginLink).toBeVisible();
    await expect(this.registerLink).toBeVisible();
    await expect(this.logoutLink).toBeHidden();
  }

  async logout() {
    await this.logoutLink.click();
    await this.expectLoggedOut();
  }

  // Account page forms --------------------------------------------------------

  async fillDeposit(amount: string) {
    await this.fillAmount('d1', amount);
  }

  async fillWithdraw(amount: string) {
    await this.fillAmount('w1', amount);
  }

  async fillTransfer(target: string, amount: string) {
    await this.page.getByTestId('t1').fill(target);
    await this.fillAmount('t2', amount);
  }

  async fillBillPayment(type: BillType | null, amount: string) {
    if (type) await this.page.getByTestId(BILL_RADIO[type]).check();
    await this.fillAmount('b4', amount);
  }

  billRadio(type: BillType) {
    return this.page.getByTestId(BILL_RADIO[type]);
  }

  /** Submit a form that should go through, and wait for the new balance to show. */
  async submitAndExpectBalance(form: Form, balance: number) {
    await this.page.getByTestId(SUBMIT_BUTTON[form]).click();
    await expect(this.balance).toHaveText(String(balance));
  }

  /**
   * Submit a form that should be rejected, and return the message the user saw:
   * the browser's own pop-up if it refused to submit, otherwise the app's error label.
   * The result is also added to the HTML report as "Actual output".
   */
  async submitExpectingRejection(form: Form): Promise<Outcome> {
    const button = this.page.getByTestId(SUBMIT_BUTTON[form]);
    const browserMessage = await button.evaluate((el) => {
      const invalid = (el as HTMLButtonElement).form?.querySelector<HTMLInputElement>(':invalid');
      return invalid?.validationMessage ?? '';
    });
    await button.click();

    let outcome: Outcome;
    if (browserMessage) {
      outcome = { shownBy: 'browser', text: browserMessage };
    } else {
      const error = this.page.getByTestId(ERROR_LABEL[form]);
      const shown = await error.waitFor({ state: 'visible', timeout: 5_000 }).then(
        () => true,
        () => false,
      );
      outcome = shown
        ? { shownBy: 'app', text: (await error.innerText()).trim() }
        : { shownBy: 'nothing', text: 'no error message; the request went through' };
    }
    test.info().annotations.push({ type: 'Actual output', description: `${outcome.shownBy}: ${outcome.text}` });
    return outcome;
  }

  async expectBalance(balance: number) {
    await expect(this.balance).toHaveText(String(balance));
  }

  async expectHistoryCount(count: number) {
    await expect(this.history).toHaveCount(count);
  }

  /** Check the newest entry in the History list. */
  async expectLastTransaction(t: { title: string; target?: string; amount: number; balance: number }) {
    const card = this.history.last();
    await expect(card.locator('h2')).toHaveText(t.title);
    await expect(card).toContainText(`target: ${t.target ?? ''}`);
    await expect(card).toContainText(`amount: ${t.amount}`);
    await expect(card).toContainText(`balance: ${t.balance}`);
  }

  /** Number inputs refuse fill() for text like "abc", so type those key by key. */
  private async fillAmount(testId: string, value: string) {
    const input = this.page.getByTestId(testId);
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      await input.fill(value);
    } else {
      await input.clear();
      await input.pressSequentially(value);
    }
  }
}
