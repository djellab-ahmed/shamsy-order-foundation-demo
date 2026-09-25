import { test, expect } from '@playwright/test';

test('unauthenticated direct order request is rejected', async ({ request }) => {
  const response = await request.post('/api/orders', { data: { role: 'owner', approved: true } });
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toBe('AUTH_REQUIRED');
});

test('390px unauthenticated view has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orders/new');
  await expect(page.getByRole('heading', { name: /Sign in|Supabase configuration needed/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('authenticated mobile worked example and owner approval', async ({ page }) => {
  test.skip(!process.env.PROOF_ADVISER_EMAIL || !process.env.PROOF_OWNER_EMAIL, 'Requires provisioned Supabase Auth users; see README.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orders/new');
  async function signIn(email: string, password: string) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'New order' })).toBeVisible();
  }
  await signIn(process.env.PROOF_ADVISER_EMAIL!, process.env.PROOF_ADVISER_PASSWORD!);
  const rate = page.locator('input[min="8000"]');
  await rate.fill('7900');
  await page.getByRole('heading', { name: 'New order' }).click();
  await expect(rate).toHaveValue('8000');
  await page.getByRole('button', { name: 'Load worked example' }).click();
  await expect(page.getByText('Within adviser limit · 1.94%')).toBeVisible();
  await expect(page.getByText('High discount · 4.32%')).toBeVisible();
  await expect(page.getByText('Owner approval required · 7.25%')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Save order' }).click();
  await expect(page.getByRole('status')).toContainText('OWNER_APPROVAL_REQUIRED');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shamsy-draft-v3') || 'null')?.lines?.length)).toBe(3);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(process.env.PROOF_OWNER_EMAIL!, process.env.PROOF_OWNER_PASSWORD!);
  await expect(page.getByText('Owner approval required · 7.25%')).toBeVisible();
  await page.getByRole('button', { name: 'Approve discount' }).click();
  await expect(page.getByText('Approved by owner · 7.25%')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(process.env.PROOF_ADVISER_EMAIL!, process.env.PROOF_ADVISER_PASSWORD!);
  await page.getByRole('button', { name: 'Save order' }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+$/);
  await expect(page.getByText('45,018,000 SDG')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/orders/new');
  await signIn(process.env.PROOF_OWNER_EMAIL!, process.env.PROOF_OWNER_PASSWORD!);
  await page.goto('/orders');
  await page.getByText('Ahmed Trading').first().click();
  await page.getByRole('button', { name: "Set today's rate to 9,000" }).click();
  await expect(page.getByRole('status')).toContainText('Current rate updated.');
  await page.reload();
  await expect(page.getByText('8,200 SDG/USD')).toBeVisible();
  await expect(page.getByText('9,000', { exact: true })).toBeVisible();
  await expect(page.getByText('45,018,000 SDG')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
