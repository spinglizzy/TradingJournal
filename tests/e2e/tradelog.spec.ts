import { test, expect } from '@playwright/test'
import { login, createTestTrade, deleteTestTrade } from './helpers'

const TEST_TICKER = 'E2ELOG'

test.describe('Trade Log', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('trade log page loads and displays the table', async ({ page }) => {
    await page.goto('/trades')
    await expect(page.getByTestId('trade-log-container')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Trade Log' })).toBeVisible()
  })

  test('Log Trade button is present', async ({ page }) => {
    await page.goto('/trades')
    await expect(page.getByTestId('log-trade-btn')).toBeVisible()
  })

  test('column headers are clickable for sorting', async ({ page }) => {
    await page.goto('/trades')
    // "Date" column is sortable
    const dateHeader = page.getByRole('columnheader', { name: 'Date' })
    await expect(dateHeader).toBeVisible({ timeout: 8_000 })
    await dateHeader.click()
    // After clicking, no crash; URL may gain sort params or the table re-renders
    await expect(page.getByTestId('trade-log-container')).toBeVisible()
  })

  test('clicking a trade row navigates to trade detail', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    await expect(page.getByTestId('trade-table')).toBeVisible({ timeout: 8_000 })
    const row = page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    await expect(row).toBeVisible({ timeout: 8_000 })
    await row.click()
    await page.waitForURL(/\/trades\/[a-z0-9-]+$/, { timeout: 10_000 })
    await expect(page.getByTestId('trade-header')).toBeVisible()
    // Clean up
    await deleteTestTrade(page, TEST_TICKER).catch(() => {})
  })

  test('trade detail view shows core trade information', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    const row = page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    await row.click()
    await page.waitForURL(/\/trades\/[a-z0-9-]+$/)

    await expect(page.getByTestId('trade-header')).toBeVisible()
    // Ticker should appear in the header
    await expect(page.locator('h1').filter({ hasText: TEST_TICKER })).toBeVisible()
    // Edit and delete buttons should be present
    await expect(page.getByTestId('edit-trade-btn')).toBeVisible()
    await expect(page.getByTestId('delete-trade-btn')).toBeVisible()
    // Clean up
    await deleteTestTrade(page, TEST_TICKER).catch(() => {})
  })

  test('P&L is displayed near the top of trade detail', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    const row = page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    await row.click()
    await page.waitForURL(/\/trades\/[a-z0-9-]+$/)

    // P&L display should be in the top summary header
    const pnl = page.getByTestId('pnl-display')
    await expect(pnl).toBeVisible()
    const text = await pnl.textContent()
    // Should contain a dollar sign
    expect(text).toMatch(/\$/)
    // Clean up
    await deleteTestTrade(page, TEST_TICKER).catch(() => {})
  })

})
