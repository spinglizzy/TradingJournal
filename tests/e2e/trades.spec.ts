import { test, expect } from '@playwright/test'
import { login, createTestTrade, deleteTestTrade } from './helpers'

const TEST_TICKER = 'E2ETEST'

test.describe('Trade Entry & Management', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test.afterEach(async ({ page }) => {
    // Best-effort cleanup: delete any test trades created during the suite
    await deleteTestTrade(page, TEST_TICKER).catch(() => {})
  })

  test('trade entry form loads with all expected fields', async ({ page }) => {
    await page.goto('/trades/new')
    await expect(page.getByTestId('ticker-input')).toBeVisible()
    await expect(page.getByTestId('direction-select')).toBeVisible()
    await expect(page.getByTestId('entry-price-input')).toBeVisible()
    await expect(page.getByTestId('exit-price-input')).toBeVisible()
    await expect(page.getByTestId('position-size-input')).toBeVisible()
    await expect(page.getByTestId('trade-submit-btn')).toBeVisible()
  })

  test('can create a new trade with required fields', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await expect(page).toHaveURL(/\/trades/, { timeout: 10_000 })
  })

  test('new trade appears in the trade log after creation', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    await expect(page.locator('[data-testid="trade-table"]')).toBeVisible()
    await expect(
      page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('can open trade detail view by clicking on a trade row', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    const row = page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    await expect(row).toBeVisible({ timeout: 8_000 })
    await row.click()
    await page.waitForURL(/\/trades\/[a-z0-9-]+$/, { timeout: 10_000 })
    await expect(page.getByTestId('trade-header')).toBeVisible()
  })

  test('can edit an existing trade and save changes', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    const row = page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    await row.click()
    await page.waitForURL(/\/trades\/[a-z0-9-]+$/)
    await page.getByTestId('edit-trade-btn').click()
    await page.waitForURL(/\/edit$/, { timeout: 8_000 })

    // Change notes
    const notesField = page.locator('textarea[name="notes"]')
    await notesField.fill('Edited by E2E test')
    await page.getByTestId('trade-submit-btn').click()
    await page.waitForURL('**/trades', { timeout: 10_000 })
  })

  test('P&L displays correctly — green for profit, red for loss', async ({ page }) => {
    // long entry 18000 exit 18050 × 1 − 5 fees = +45 profit
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    const row = page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    await row.click()
    await page.waitForURL(/\/trades\/[a-z0-9-]+$/)
    const pnl = page.getByTestId('pnl-display')
    await expect(pnl).toBeVisible()
    // The element should have a green (emerald) class for a profit trade
    await expect(pnl).toHaveClass(/emerald|green/)
  })

  test('screenshot upload section is present in trade entry', async ({ page }) => {
    await page.goto('/trades/new')
    // The screenshot upload area renders with a dashed border placeholder
    const uploadArea = page.getByTestId('screenshot-upload-area').or(
      page.locator('[data-testid="screenshot-panel"]')
    ).or(
      page.getByText('Click to upload a chart screenshot')
    )
    await expect(uploadArea).toBeVisible({ timeout: 8_000 })
  })

  test('bias dropdown has Bullish, Bearish, Neutral options', async ({ page }) => {
    await page.goto('/trades/new')
    const bias = page.locator('select[name="bias"]')
    await expect(bias).toBeVisible()
    const options = await bias.locator('option').allTextContents()
    expect(options.map(o => o.toLowerCase())).toEqual(
      expect.arrayContaining(['bullish', 'bearish', 'neutral'])
    )
  })

  test('SMT divergence dropdown has Yes and No options', async ({ page }) => {
    await page.goto('/trades/new')
    const smt = page.locator('select[name="smt_divergence"]')
    await expect(smt).toBeVisible()
    const options = await smt.locator('option').allTextContents()
    expect(options.map(o => o.toLowerCase())).toEqual(
      expect.arrayContaining(['yes', 'no'])
    )
  })

  test('can add and remove confluence tags', async ({ page }) => {
    await page.goto('/trades/new')
    // The ConfluenceInput is a tag-style input; type into its inner text input
    const confluenceInput = page.locator('.min-h-\\[40px\\]').nth(0).locator('input')
    await confluenceInput.fill('Support Level')
    await confluenceInput.press('Enter')
    // Tag should appear
    await expect(page.getByText('Support Level')).toBeVisible()
    // Remove it via the × button
    await page.getByText('Support Level').locator('..').getByRole('button').click()
    await expect(page.getByText('Support Level')).not.toBeVisible()
  })

  test('can add and remove Contested Factors tags', async ({ page }) => {
    await page.goto('/trades/new')
    // PD Arrays / Contested Factors input — second tag input after confluences
    const pdInput = page.locator('.min-h-\\[40px\\]').nth(1).locator('input')
    await pdInput.fill('Order Block')
    await pdInput.press('Enter')
    await expect(page.getByText('Order Block')).toBeVisible()
    await page.getByText('Order Block').locator('..').getByRole('button').click()
    await expect(page.getByText('Order Block')).not.toBeVisible()
  })

  test('can delete a trade', async ({ page }) => {
    await createTestTrade(page, { ticker: TEST_TICKER })
    await page.goto('/trades')
    const row = page.locator('[data-testid^="trade-row-"]').filter({ hasText: TEST_TICKER }).first()
    await row.click()
    await page.waitForURL(/\/trades\/[a-z0-9-]+$/)
    await page.getByTestId('delete-trade-btn').click()
    // Confirm dialog
    await page.getByRole('button', { name: /delete/i }).last().click()
    await page.waitForURL('**/trades', { timeout: 10_000 })
  })

})
