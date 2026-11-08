import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Settings come from your shell or from a .env file next to this one (see
// .env.example). A value set in the shell wins over the file.
//   TEST_BROWSER  which browser runs the tests (see below), default: chromium
//   HEADLESS=1    run without a browser window, in parallel
//   SLOWMO        pause between steps in ms, default 400 (0 when headless)
const envFile = join(__dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

type BrowserChoice = {
  name: string;
  use: PlaywrightTestConfig['use'];
  executablePath?: string;
  /** Set when the browser can't show the pages the tests drive; says why. */
  noWindow?: string;
};

/**
 * TEST_BROWSER values:
 *   chromium          Playwright's own Chromium (downloaded by `npm install`)
 *   chrome, edge      Google Chrome / Microsoft Edge installed on this computer
 *   dia               Dia in /Applications (macOS); runs without a window, see below
 *   brave             Brave in /Applications (macOS)
 *   firefox, webkit   Playwright's Firefox / WebKit (Safari's engine);
 *                     download first with `npx playwright install firefox` (or webkit)
 *   /path/to/browser  any other Chromium-based browser's executable
 */
function pickBrowser(choice: string): BrowserChoice {
  const apps: Record<string, string> = {
    dia: '/Applications/Dia.app/Contents/MacOS/Dia',
    brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  };
  const executable = (name: string, path: string): BrowserChoice => {
    if (!existsSync(path)) {
      throw new Error(`TEST_BROWSER=${choice}: ${name} not found at "${path}". Set TEST_BROWSER to its full path.`);
    }
    return { name, use: devices['Desktop Chrome'], executablePath: path };
  };

  switch (choice.toLowerCase()) {
    case '':
    case 'chromium':
      return { name: 'Chromium', use: devices['Desktop Chrome'] };
    case 'chrome':
      return { name: 'Google Chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } };
    case 'edge':
      return { name: 'Microsoft Edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } };
    case 'firefox':
      return { name: 'Firefox', use: devices['Desktop Firefox'] };
    case 'webkit':
    case 'safari':
      return { name: 'WebKit', use: devices['Desktop Safari'] };
    case 'dia':
      // Dia only shows tabs it opened itself: pages opened by Playwright get a
      // 0x0 window that can't be resized, and a fresh profile shows Dia's
      // sign-in intro on top. The tests still pass in Dia; they just can't be watched.
      return {
        ...executable('Dia', apps.dia),
        noWindow: "Dia doesn't show pages opened by test tools, so the tests run in Dia without a window.",
      };
    case 'brave':
      return executable('Brave', apps.brave);
    default:
      if (/[\\/]/.test(choice)) return executable(choice, choice);
      throw new Error(
        `Unknown TEST_BROWSER "${choice}". Use chromium, chrome, edge, firefox, webkit, dia, brave, or a path to a browser.`,
      );
  }
}

const browser = pickBrowser(process.env.TEST_BROWSER ?? '');
const headless = process.env.HEADLESS === '1' || Boolean(browser.noWindow);
const slowMo = Number(process.env.SLOWMO || (headless ? 0 : 400));

// The config is loaded again in every worker; announce the browser only once.
if (!process.env.TEST_WORKER_INDEX) {
  console.log(`Browser: ${browser.name}${headless ? ' (headless)' : `, slow motion ${slowMo} ms`}`);
  if (browser.noWindow && process.env.HEADLESS !== '1') {
    console.log(`  ${browser.noWindow}\n  To watch the tests, use TEST_BROWSER=chromium (Dia is built on Chromium too) or chrome.`);
  }
}

export default defineConfig({
  testDir: './tests',
  // One browser window at a time while watching; several in parallel when headless.
  workers: headless ? undefined : 1,
  timeout: 90_000,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    ...browser.use,
    baseURL: 'http://localhost:3000',
    // The app tags its inputs, buttons and error labels with cid="...".
    testIdAttribute: 'cid',
    headless,
    launchOptions: { executablePath: browser.executablePath, slowMo },
    // A screenshot of the final screen goes into the HTML report for every
    // test, to use as "Actual Output". Failed tests also keep a step-by-step trace.
    screenshot: 'on',
    trace: 'retain-on-failure',
  },

  // Uses the app if it's already running, otherwise starts it with ./start.sh
  // and stops it again when the tests finish.
  webServer: {
    command: './start.sh',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
  },
});
