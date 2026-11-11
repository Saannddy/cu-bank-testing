import type { Reporter, Suite, TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';

type Cause = 'dot' | 'wording' | 'browser' | 'nothing' | 'other';

const GROUPS: { cause: Cause; title: string }[] = [
  { cause: 'dot', title: 'Typo: message differs only by the final "."' },
  { cause: 'wording', title: 'Typo: message wording differs from the requirement' },
  { cause: 'browser', title: 'Browser blocked the form, so the app message never showed' },
  { cause: 'nothing', title: 'No error shown, the transaction went through' },
  { cause: 'other', title: 'Other failures' },
];

const MESSAGE_CHECK = 'Message shown to the user';

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const withoutFinalDot = (s: string) => s.trim().replace(/\.$/, '');

function outcome(result: TestResult, type: string) {
  const value = result.annotations.find((a) => a.type === type)?.description;
  if (!value) return undefined;
  const at = value.indexOf(': ');
  return { by: value.slice(0, at), text: value.slice(at + 2) };
}

function describe(error: TestError): string {
  const lines = stripAnsi(error.message ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const value = (label: string) => lines.find((line) => line.startsWith(`${label}:`))?.slice(label.length + 1).trim();
  const expected = value('Expected');
  const received = value('Received');
  if (expected !== undefined && received !== undefined) return `expected ${expected}, got ${received}`;
  return lines.find((line) => !line.startsWith('Error:')) ?? lines[0] ?? 'failed';
}

function failedChecks(steps: TestStep[], within = ''): string[] {
  return steps.flatMap((step) => {
    const title = step.category === 'test.step' ? step.title : within;
    if (step.category === 'expect' && step.error) {
      return step.title === MESSAGE_CHECK ? [] : [`${title || step.title}: ${describe(step.error)}`];
    }
    return failedChecks(step.steps, title);
  });
}

function classify(result: TestResult): { cause: Cause; lines: string[] } {
  const expected = outcome(result, 'Expected output');
  const actual = outcome(result, 'Actual output');
  const checks = failedChecks(result.steps);
  const lines: string[] = [];
  let cause: Cause = 'other';

  if (expected && actual && actual.text !== expected.text) {
    lines.push(`expected  ${expected.by}: "${expected.text}"`, `actual    ${actual.by}: "${actual.text}"`);
    if (actual.by === 'browser') cause = 'browser';
    else if (actual.by === 'nothing') cause = 'nothing';
    else if (withoutFinalDot(actual.text) === withoutFinalDot(expected.text)) cause = 'dot';
    else cause = 'wording';
  }

  if (checks.length > 0) {
    lines.push(...checks.map((check) => `also      ${check}`));
  } else if (cause === 'other') {
    lines.push(...result.errors.map((error) => `error     ${describe(error)}`));
  }
  return { cause, lines };
}

export default class FailureSummaryReporter implements Reporter {
  private suite?: Suite;

  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite;
  }

  printsToStdio() {
    return true;
  }

  onEnd() {
    if (!this.suite) return;
    const tests = this.suite.allTests().filter((test) => test.results.length > 0);
    const failed = tests.filter((test: TestCase) => test.outcome() === 'unexpected');
    const out: string[] = ['', '──────── Failure summary ────────'];

    if (failed.length === 0) {
      out.push(`All ${tests.length} tests passed.`, '');
      console.log(out.join('\n'));
      return;
    }

    out.push(`${failed.length} of ${tests.length} tests failed`);
    const sorted = [...failed].sort((a, b) => a.title.localeCompare(b.title));
    const classified = sorted.map((test) => ({ test, ...classify(test.results[test.results.length - 1]) }));

    for (const group of GROUPS) {
      const members = classified.filter((c) => c.cause === group.cause);
      if (members.length === 0) continue;
      out.push('', `${group.title} (${members.length})`);
      for (const { test, lines } of members) {
        out.push(`  ✘ ${test.title}`, ...lines.map((line) => `      ${line}`));
      }
    }

    const typos = classified.filter((c) => c.cause === 'dot' || c.cause === 'wording').length;
    out.push('', `Typos: ${typos}   Other failures: ${failed.length - typos}`, '');
    console.log(out.join('\n'));
  }
}
