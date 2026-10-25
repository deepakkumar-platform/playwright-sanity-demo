import { test, expect } from '@playwright/test';
import { login, users } from '../helpers/login';

// Test titles start with the ID from the sanity sheet, so the report maps 1:1 to the Excel rows.

test('SAN-001 Log in and landing page loads', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await login(page, 'admin');
  await expect(page.getByText('Welcome, QA Admin')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('SAN-001 Wrong password shows an error', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(users.admin.username);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password');
});

test('SAN-002 User sees only the modules of their profile', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await login(page, 'chef');
  await expect(page.getByText('Profile: Chef')).toBeVisible();

  const modules = page.getByRole('navigation', { name: 'Modules' });
  await expect(modules.getByRole('link', { name: 'Recipes' })).toBeVisible();
  await expect(modules.getByRole('link', { name: 'Menu' })).toBeVisible();
  await expect(modules.getByRole('link', { name: 'Inventory' })).toHaveCount(0);

  // Typing the URL directly must not get around the profile
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});
