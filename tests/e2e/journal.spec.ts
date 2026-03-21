import { test, expect } from '@playwright/test'
import { login } from './helpers'

const TEST_ENTRY_TITLE = 'E2E Test Entry'
const TEST_ENTRY_CONTENT = 'This is a test journal entry created by Playwright.'

test.describe('Journal', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/journal')
    await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible({ timeout: 10_000 })
  })

  test('journal page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible()
    // View tabs should be visible
    await expect(page.getByRole('button', { name: /calendar/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /list/i })).toBeVisible()
  })

  test('can create a new journal entry', async ({ page }) => {
    await page.getByRole('button', { name: /new entry/i }).first().click()

    // Editor should open — look for the title input
    const titleInput = page.getByTestId('journal-title-input')
    await expect(titleInput).toBeVisible({ timeout: 8_000 })
    await titleInput.fill(TEST_ENTRY_TITLE)

    // Fill the rich text editor (TipTap renders a contenteditable div)
    const editor = page.locator('.ProseMirror').or(page.locator('[contenteditable="true"]')).first()
    await editor.click()
    await editor.fill(TEST_ENTRY_CONTENT)

    // Save
    await page.getByRole('button', { name: /create entry|save/i }).last().click()

    // Editor should close
    await expect(page.getByRole('button', { name: /new entry/i })).toBeVisible({ timeout: 10_000 })
  })

  test('new entry appears after saving', async ({ page }) => {
    // Switch to list view to see entries
    await page.getByRole('button', { name: /new entry/i }).first().click()

    const titleInput = page.getByTestId('journal-title-input')
    await expect(titleInput).toBeVisible({ timeout: 8_000 })
    await titleInput.fill(TEST_ENTRY_TITLE)

    const editor = page.locator('.ProseMirror').or(page.locator('[contenteditable="true"]')).first()
    await editor.click()
    await editor.fill(TEST_ENTRY_CONTENT)
    await page.getByRole('button', { name: /create entry|save/i }).last().click()
    await page.waitForTimeout(1_000)

    // Switch to list view
    await page.getByRole('button', { name: /^list$/i }).click()
    await expect(
      page.getByText(TEST_ENTRY_TITLE)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('can edit an existing journal entry', async ({ page }) => {
    // Switch to list view to find existing entries
    await page.getByRole('button', { name: /^list$/i }).click()
    await page.waitForTimeout(500)

    const firstEntry = page.locator('[data-testid^="journal-entry-"]').first()
    if (!(await firstEntry.isVisible())) {
      test.skip()
      return
    }

    await firstEntry.click()

    // Editor opens with the entry content
    const editor = page.locator('.ProseMirror').or(page.locator('[contenteditable="true"]')).first()
    await expect(editor).toBeVisible({ timeout: 8_000 })
    await editor.fill('Updated by E2E test')

    await page.getByRole('button', { name: /save changes/i }).click()
    await page.waitForTimeout(1_000)

    // Editor closed
    await expect(page.getByRole('button', { name: /new entry/i })).toBeVisible({ timeout: 8_000 })
  })

  test('entry content persists after save and reload', async ({ page }) => {
    // Create an entry
    await page.getByRole('button', { name: /new entry/i }).first().click()

    const titleInput = page.getByTestId('journal-title-input')
    await expect(titleInput).toBeVisible({ timeout: 8_000 })
    await titleInput.fill(TEST_ENTRY_TITLE)

    const editor = page.locator('.ProseMirror').or(page.locator('[contenteditable="true"]')).first()
    await editor.click()
    await editor.fill(TEST_ENTRY_CONTENT)
    await page.getByRole('button', { name: /create entry|save/i }).last().click()
    await page.waitForTimeout(1_000)

    // Reload
    await page.reload()
    await page.waitForURL('**/journal')

    // Switch to list view to see the entry
    await page.getByRole('button', { name: /^list$/i }).click()
    await expect(page.getByText(TEST_ENTRY_TITLE)).toBeVisible({ timeout: 8_000 })
  })

})
