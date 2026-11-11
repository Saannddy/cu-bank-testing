import { expect, test } from '@playwright/test';
import {
  type Account,
  CUBank,
  MSG,
  createAccount,
  expectAppMessage,
  fetchAccount,
  unregisteredAccountId,
} from './support/cubank';

const SENDER_PASSWORD = '0427';

type Target =
  | { kind: 'recipient' }
  | { kind: 'unregistered' }
  | { kind: 'own' }
  | { kind: 'typed'; value: string };

type TransferCase = { id: string; title: string; eq: string; target: Target; amount: string; expected: string };

const cases: TransferCase[] = [
  {
    id: 'TC05_001',
    title: 'Target account is not registered',
    eq: 'Transfer06: TA1, TT2',
    target: { kind: 'unregistered' },
    amount: '20',
    expected: MSG.transfer.recipientNotFound,
  },
  {
    id: 'TC05_002',
    title: 'Target account contains a letter',
    eq: 'Transfer09: TA1, TT5',
    target: { kind: 'typed', value: '123456789x' },
    amount: '20',
    expected: MSG.transfer.accountNumbersOnly,
  },
  {
    id: 'TC05_003',
    title: 'Target account has fewer than 10 digits',
    eq: 'Transfer08: TA1, TT4',
    target: { kind: 'typed', value: '123456789' },
    amount: '20',
    expected: MSG.transfer.accountTenDigits,
  },
  {
    id: 'TC05_004',
    title: 'Transfer to your own account',
    eq: 'Transfer07: TA1, TT3',
    target: { kind: 'own' },
    amount: '20',
    expected: MSG.transfer.ownAccount,
  },
  {
    id: 'TC05_005',
    title: 'Amount is not a number',
    eq: 'Transfer02: TA2, TT1',
    target: { kind: 'recipient' },
    amount: 'abc',
    expected: MSG.amount.notNumber,
  },
  {
    id: 'TC05_006',
    title: 'Amount has decimals',
    eq: 'Transfer03: TA3, TT1',
    target: { kind: 'recipient' },
    amount: '1.5',
    expected: MSG.amount.notWhole,
  },
  {
    id: 'TC05_007',
    title: 'Amount is 0',
    eq: 'Transfer04: TA4, TT1',
    target: { kind: 'recipient' },
    amount: '0',
    expected: MSG.amount.notPositive,
  },
  {
    id: 'TC05_008',
    title: 'Amount is more than the balance',
    eq: 'Transfer10: TA5, TT1',
    target: { kind: 'recipient' },
    amount: '81',
    expected: MSG.notEnough.transfer,
  },
  {
    id: 'TC05_009',
    title: 'Amount equals the balance',
    eq: 'Transfer05: TA5, TT1',
    target: { kind: 'recipient' },
    amount: '80',
    expected: MSG.notEnough.transfer,
  },
];

test.describe('Scenario 5: Login, deposit and withdrawal pass, transfer fails', () => {
  let bank: CUBank;
  let sender: Account;

  test.beforeEach(async ({ page, request }) => {
    bank = new CUBank(page);
    sender = await test.step('Pre-condition: a registered sender with balance 0', () =>
      createAccount(request, { password: SENDER_PASSWORD }),
    );
    await test.step(`Log in as ${sender.accountId} (LA1, LP1)`, () => bank.loginAs(sender));
    await test.step('Deposit 100: balance 100 (DA1)', async () => {
      await bank.fillDeposit('100');
      await bank.submitAndExpectBalance('deposit', 100);
    });
    await test.step('Withdraw 20: balance 80 (WA1)', async () => {
      await bank.fillWithdraw('20');
      await bank.submitAndExpectBalance('withdraw', 80);
    });
  });

  for (const c of cases) {
    test(`${c.id} ${c.title} (${c.eq})`, async ({ request }) => {
      let recipient: Account | undefined;
      let target: string;
      switch (c.target.kind) {
        case 'recipient':
          recipient = await test.step('Pre-condition: a recipient account with balance 0', () => createAccount(request));
          target = recipient.accountId;
          break;
        case 'unregistered':
          target = await test.step('Pre-condition: the target account number is not registered', () =>
            unregisteredAccountId(request),
          );
          break;
        case 'own':
          target = sender.accountId;
          break;
        case 'typed':
          target = c.target.value;
          break;
      }

      await test.step(`Transfer "${c.amount}" to ${target}`, () => bank.fillTransfer(target, c.amount));
      const outcome = await test.step('Press Confirm', () => bank.submitExpectingRejection('transfer'));

      await test.step('Expected output: error message', () => expectAppMessage(outcome, c.expected));
      await test.step('Post-condition: sender still has 80, history only has the deposit and withdrawal', async () => {
        await bank.expectBalance(80);
        await bank.expectHistoryCount(2);
      });
      if (recipient) {
        const r = recipient;
        await test.step('Post-condition: recipient balance and history unchanged', async () => {
          const data = await fetchAccount(request, r);
          expect(data.balance, 'recipient balance').toBe(0);
          expect(data.transactions, 'recipient history').toHaveLength(0);
        });
      }
    });
  }
});
