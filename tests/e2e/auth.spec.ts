import { test, expect } from '@playwright/test'
import { login, logout, waitForDashboard, TEST_EMAIL, TEST_PASSWORD } from './helpers'

test.describe('Authentication', () => {

  test('unauthenticated user visiting /dashboard gets redirected to /login', async ({ page }) => {
    // Clear any stored auth state
    await page.context().clearCookies()
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('login with valid credentials redirects to /dashboard', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByTestId('dashboard-container')).toBeVisible()
  })

  test('login with invalid credentials shows error message', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('email-input').fill('wrong@example.com')
    await page.getByTestId('password-input').fill('wrongpassword')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 8_000 })
  })

  test('signup page loads and shows the registration form', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByTestId('email-input')).toBeVisible()
    await expect(page.getByTestId('password-input')).toBeVisible()
    await expect(page.getByTestId('signup-submit')).toBeVisible()
    await expect(page.getByTestId('signup-submit')).toHaveText(/create account/i)
  })

  test('logout redirects to /login', async ({ page }) => {
    await login(page)
    await logout(page)
    await expect(page).toHaveURL(/\/login/)
  })

  test('session persists after page refresh', async ({ page }) => {
    await login(page)
    await page.reload()
    // Should stay on dashboard (Supabase restores session from localStorage)
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page.getByTestId('dashboard-container')).toBeVisible()
  })

})
