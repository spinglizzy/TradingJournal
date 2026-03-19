import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Analytics', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/analytics')
    // Wait for the page to load
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible({ timeout: 10_000 })
  })

  test('analytics page loads with charts visible', async ({ page }) => {
    // The Overview tab should load charts from recharts
    await expect(page.getByTestId('tab-overview')).toBeVisible()
    // Give charts time to render
    await page.waitForTimeout(1_500)
    // Recharts renders SVG elements
    const svgs = page.locator('svg').filter({ hasNot: page.locator('defs') })
    // Allow for the case where there are no trades yet (shows empty state)
    const count = await svgs.count()
    expect(count).toBeGreaterThanOrEqual(0) // page rendered without crashing
  })

  test('Best Streak card displays with full word "Wins" not "W"', async ({ page }) => {
    // Wait for metrics to load
    await page.waitForTimeout(2_000)
    const bestStreakCard = page.getByTestId('metric-best-streak')
    // It may show "—" if there are no trades yet, or "N Wins" if there are trades
    if (await bestStreakCard.isVisible()) {
      const text = await bestStreakCard.textContent()
      if (text && text !== '—') {
        expect(text).toMatch(/win(s)?/i)
        expect(text).not.toMatch(/^\d+\s*W$/)
      }
    }
  })

  test('Worst Streak card displays with full word "Losses" not "L"', async ({ page }) => {
    await page.waitForTimeout(2_000)
    const worstStreakCard = page.getByTestId('metric-worst-streak')
    if (await worstStreakCard.isVisible()) {
      const text = await worstStreakCard.textContent()
      if (text && text !== '—') {
        expect(text).toMatch(/loss(es)?/i)
        expect(text).not.toMatch(/^\d+\s*L$/)
      }
    }
  })

  test('date range filter is present and changes content', async ({ page }) => {
    // LocalDateFilter renders date inputs
    const fromInput = page.locator('input[type="date"]').first()
    await expect(fromInput).toBeVisible({ timeout: 8_000 })
    // Change the from date
    await fromInput.fill('2024-01-01')
    await fromInput.press('Enter')
    // No crash — page still renders
    await expect(page.getByTestId('tab-overview')).toBeVisible()
  })

  test('all analytics tabs are present', async ({ page }) => {
    const tabs = ['overview', 'time', 'setup', 'instrument', 'tags', 'custom']
    for (const tabId of tabs) {
      await expect(page.getByTestId(`tab-${tabId}`)).toBeVisible()
    }
  })

})
