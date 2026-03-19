import { type Page, expect } from '@playwright/test'

export const TEST_EMAIL    = process.env.E2E_EMAIL    || 'test@pulsejournal.com'
export const TEST_PASSWORD = process.env.E2E_PASSWORD || 'testpassword123'

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByTestId('email-input').fill(TEST_EMAIL)
  await page.getByTestId('password-input').fill(TEST_PASSWORD)
  await page.getByTestId('login-submit').click()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await waitForDashboard(page)
}

export async function logout(page: Page) {
  await page.getByTestId('user-menu-btn').click()
  await page.getByTestId('nav-logout-btn').click()
  await page.waitForURL('**/login', { timeout: 10_000 })
}

export async function waitForDashboard(page: Page) {
  await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 10_000 })
}

// ── Trade helpers ─────────────────────────────────────────────────────────────

interface TradeOverrides {
  ticker?: string
  direction?: 'long' | 'short'
  entry_price?: string
  exit_price?: string
  position_size?: string
  fees?: string
}

export async function createTestTrade(page: Page, overrides: TradeOverrides = {}) {
  const {
    ticker       = 'NQ',
    direction    = 'long',
    entry_price  = '18000',
    exit_price   = '18050',
    position_size = '1',
    fees         = '5',
  } = overrides

  await page.goto('/trades/new')
  await expect(page.getByTestId('ticker-input')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('ticker-input').fill(ticker)
  await page.getByTestId('direction-select').selectOption(direction)
  await page.getByTestId('entry-price-input').fill(entry_price)
  await page.getByTestId('exit-price-input').fill(exit_price)
  await page.getByTestId('position-size-input').fill(position_size)

  // fees field — clear default 0 first
  const feesInput = page.locator('input[name="fees"]')
  await feesInput.fill(fees)

  await page.getByTestId('trade-submit-btn').click()
  // After submit, redirects to /trades
  await page.waitForURL('**/trades', { timeout: 15_000 })
}

export async function deleteTestTrade(page: Page, ticker: string) {
  await page.goto('/trades')
  await page.waitForSelector('[data-testid="trade-table"]', { timeout: 10_000 })

  // Find first row matching the ticker
  const row = page.locator(`[data-testid^="trade-row-"]`).filter({ hasText: ticker }).first()
  if (!(await row.isVisible())) return  // nothing to delete

  await row.click()
  await expect(page.getByTestId('delete-trade-btn')).toBeVisible({ timeout: 8_000 })
  await page.getByTestId('delete-trade-btn').click()

  // Confirm dialog — look for a confirm button
  const confirmBtn = page.getByRole('button', { name: /delete/i }).last()
  await confirmBtn.click()
  await page.waitForURL('**/trades', { timeout: 10_000 })
}
