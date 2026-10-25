import { Page, expect } from '@playwright/test';

// In CI the real values come from secrets. The defaults only work on the local demo app.
export const users = {
  admin: { username: process.env.SANITY_ADMIN_USER || 'qa.admin', password: process.env.SANITY_ADMIN_PASSWORD || 'demo-admin' },
  chef: { username: process.env.SANITY_CHEF_USER || 'qa.chef', password: process.env.SANITY_CHEF_PASSWORD || 'demo-chef' },
};

export async function login(page: Page, who: keyof typeof users) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(users[who].username);
  await page.getByLabel('Password').fill(users[who].password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}
