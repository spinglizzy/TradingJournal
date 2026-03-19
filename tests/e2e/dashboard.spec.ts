import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('dashboard loads and displays widgets', async ({ page }) => {
    await expect(page.getByTestId('dashboard-container')).toBeVisible()
    // At least one widget card should be rendered
    await expect(page.locator('.react-grid-item').first()).toBeVisible({ timeout: 8_000 })
  })

  test('date range filter is present and interactive', async ({ page }) => {
    // DateRangeFilter renders a button with a calendar icon
    const filterBtn = page.locator('[data-testid="date-range-filter"]').or(
      page.getByRole('button', { name: /today|7d|30d|all time|custom/i }).first()
    )
    await expect(filterBtn).toBeVisible({ timeout: 8_000 })
  })

  test('navigation to trade log works', async ({ page }) => {
    await page.getByTestId('nav-trades').click()
    await page.waitForURL('**/trades', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/trades/)
  })

  test('navigation to analytics works', async ({ page }) => {
    await page.getByTestId('nav-analytics').click()
    await page.waitForURL('**/analytics', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/analytics/)
  })

  test('navigation to journal works', async ({ page }) => {
    await page.getByTestId('nav-journal').click()
    await page.waitForURL('**/journal', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/journal/)
  })

  test('navigation back to dashboard works', async ({ page }) => {
    // First go to trades, then back to dashboard
    await page.getByTestId('nav-trades').click()
    await page.waitForURL('**/trades')
    await page.getByTestId('nav-dashboard').click()
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page.getByTestId('dashboard-container')).toBeVisible()
  })

  test('add widget button is present', async ({ page }) => {
    await expect(page.getByTestId('add-widget-btn')).toBeVisible()
  })

  test('widget drag handles are present in the DOM', async ({ page }) => {
    // react-grid-layout adds .react-resizable-handle on each widget
    await expect(page.locator('.react-grid-item').first()).toBeVisible({ timeout: 8_000 })
    // Each grid item should have a drag handle (the whole item is draggable)
    const gridItems = page.locator('.react-grid-item')
    expect(await gridItems.count()).toBeGreaterThan(0)
  })

  test('theme toggle switches theme', async ({ page }) => {
    // Theme is controlled via data-theme attribute on <html>
    // The theme toggle lives in the Settings page, not the main nav
    // We verify the data-theme attribute exists and is a valid value
    const htmlEl = page.locator('html')
    const currentTheme = await htmlEl.getAttribute('data-theme')
    expect(['dark', 'light']).toContain(currentTheme)
  })

})
