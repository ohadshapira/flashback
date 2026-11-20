import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const PORT_NO_GOOGLE = 3101;
const MOCK_PORT = 4010;

// Runtime env shared by both app servers. NEXT_PUBLIC_* values are inlined at build time (see webServer command).
const common = {
  APP_BASE_URL: `http://localhost:${PORT}`,
  DEMO_MODE: 'true',
  IMAGE_RETENTION_DAYS: '7',
  FLASHBACK_TIME_SCALE: '2', // party rounds run 2x faster (30s) so stage sync and auto-reveal are testable
  NEXT_DIST_DIR: '.next-e2e',
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    // Software-rendered CI browsers choke on full-screen looping animations; the app honours this setting (and it is a
    // real accessibility path), so the suite runs with it.
    reducedMotion: 'reduce',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'mobile', testIgnore: ['**/desktop.spec.ts', '**/nogoogle.spec.ts'], use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PORT}` } },
    { name: 'desktop', testMatch: ['**/desktop.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}` } },
    { name: 'nogoogle', testMatch: ['**/nogoogle.spec.ts'], use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PORT_NO_GOOGLE}` } },
  ],
  webServer: [
    { command: 'node tests/mocks/google-mock-server.mjs', port: MOCK_PORT, reuseExistingServer: true, env: { MOCK_GOOGLE_PORT: String(MOCK_PORT) } },
    {
      // Production build + server, with Google pointed at the local mock.
      command: `node scripts/e2e-clean.mjs .next-e2e && npx next build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...common,
        NEXT_PUBLIC_E2E: '1', // build-time: exposes the map instance for assertions
        NEXT_PUBLIC_DEFAULT_LOCALE: 'he', // the suite's assertions use the Hebrew (RTL) copy; the product default is English
        NEXT_PUBLIC_MAP_START: 'world', // deterministic: the suite asserts the neutral world view (the product default opens on the player's region)
        NEXT_PUBLIC_MAP_STYLE_URL: 'local', // bundled offline map: deterministic, no network
        FLASHBACK_DATA_DIR: './data-e2e',
        GOOGLE_CLIENT_ID: 'mock-client-id',
        GOOGLE_CLIENT_SECRET: 'mock-client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: `http://localhost:${PORT}/api/auth/google/callback`,
        GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
        GOOGLE_AUTH_URL: `http://localhost:${MOCK_PORT}/auth`,
        GOOGLE_TOKEN_URL: `http://localhost:${MOCK_PORT}/token`,
        GOOGLE_PICKER_API_BASE: `http://localhost:${MOCK_PORT}`,
      },
    },
    {
      // Same build, but with NO Google credentials: proves the "not configured" path.
      command: `node scripts/e2e-wait-then-start.mjs http://localhost:${PORT} ${PORT_NO_GOOGLE}`,
      url: `http://localhost:${PORT_NO_GOOGLE}`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      // Empty strings pin "no credentials" even if a developer's .env.local contains real ones.
      env: { ...common, APP_BASE_URL: `http://localhost:${PORT_NO_GOOGLE}`, FLASHBACK_DATA_DIR: './data-e2e-nogoogle', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
    },
  ],
});
