import { test, expect } from '@playwright/test';
import { login } from '../helpers/login';

test.beforeEach(async ({ page }) => {
  await login(page, 'admin');
});

test('SAN-005 Search a product and see its setup', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await page.goto('/products');
  await page.getByLabel('Search products').fill('basmati');
  await page.getByRole('button', { name: 'Search' }).click();

  const row = page.getByRole('row', { name: /Basmati Rice 10kg/ });
  await expect(row).toContainText('P-1001');
  await expect(row).toContainText('Bag');
});

test('SAN-006 Open a recipe and see its details', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await page.goto('/recipes');
  await page.getByRole('link', { name: 'Chicken Biryani' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chicken Biryani');
  await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
  await expect(page.getByText('Meal type: Lunch')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Allergens' })).toBeVisible();
});

test('SAN-008 Recipe nutrition values are correct', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await page.goto('/recipes/101');
  const nutrition = page.getByRole('region', { name: 'Nutrition per serving' });
  await expect(nutrition.getByRole('row', { name: /Calories/ })).toContainText('520 kcal');
  await expect(nutrition.getByRole('row', { name: /Protein/ })).toContainText('28 g');
});

test('SAN-010 Menu shows saved items on the right day', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await page.goto('/menu');
  const monday = page.getByRole('row', { name: /Monday Lunch/ });
  await expect(monday).toContainText('Chicken Biryani');
});

test('SAN-014 Inventory screen loads for an allowed user', { tag: ['@sanity', '@P1'] }, async ({ page }) => {
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Dry Store/ })).toContainText('Basmati Rice 10kg');
});
