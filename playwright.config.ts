import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4399', headless: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true },
  // Tests run against the production build, so the service worker and CSP are the real ones.
  webServer: { command: 'npm run build && npx vite preview --port 4399 --strictPort', url: 'http://localhost:4399', reuseExistingServer: false, timeout: 180_000 },
})
