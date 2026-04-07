/**
 * Ejemplo: E2E test para la pagina /posts
 *
 * Este archivo muestra el patron basico para testear una pagina con Playwright.
 * Copia este patron y adaptalo a tu pagina.
 */
import { test, expect } from '@playwright/test'

test.describe('Posts page', () => {
  // Navegar a la pagina antes de cada test
  test.beforeEach(async ({ page }) => {
    await page.goto('/posts')
  })

  // Test 1: La pagina carga y muestra contenido
  test('shows page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /posts/i }),
    ).toBeVisible({ timeout: 10_000 })
  })

  // Test 2: Elementos principales visibles
  test('shows create button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /crear|nuevo|new/i }),
    ).toBeVisible()
  })

  // Test 3: Interaccion del usuario
  test('opens create dialog when clicking new', async ({ page }) => {
    await page.getByRole('button', { name: /crear|nuevo/i }).click()
    await expect(
      page.getByRole('dialog'),
    ).toBeVisible()
  })

  // Test 4: Redirige sin auth (usar contexto limpio)
  test('redirects to login without auth', async ({ browser }) => {
    const context = await browser.newContext() // sin storageState = sin sesion
    const page = await context.newPage()
    await page.goto('/posts')
    await expect(page).toHaveURL(/\/login/)
    await context.close()
  })
})
