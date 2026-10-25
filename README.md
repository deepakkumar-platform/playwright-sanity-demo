# Playwright sanity tests + GitHub Actions (demo)

A small "Kitchen Portal" web app, Playwright sanity tests named after the sanity sheet IDs (SAN-001 …), and a pipeline that:

| Requirement | How |
|---|---|
| Run on every push | `on: push` (branch `main`) |
| Run once every 24 hours | `on: schedule`, `30 1 * * *` = 07:00 IST |
| Report for pass **and** fail | Run summary table + `playwright-report` (HTML) + `sanity-results` (CSV / JUnit) artifacts |
| Notify the team every run | `notify` job → Teams Adaptive Card (or a notice when the webhook isn't set) |

## Layout

```
app/                         demo web app (Express, in-memory data)
tests/helpers/login.ts       login helper; users from env/secrets
tests/sanity/*.spec.ts       the sanity tests, tagged @sanity
playwright.config.ts         reporters, retries, screenshots/trace, starts the app when BASE_URL is empty
scripts/sanity-summary.mjs   results.json → summary table, CSV, step outputs
.github/workflows/sanity-tests.yml
```

## Run locally

```bash
npm install
npx playwright install chromium   # once
npm test                          # starts the app, runs all tests
npm run report                    # opens the HTML report
DEMO_BUG=nutrition npm test       # same, with a bug: SAN-008 fails
BASE_URL=https://qa.example.com npm test   # test a deployed site instead
```

Demo users: `qa.admin` / `demo-admin` (all modules), `qa.chef` / `demo-chef` (Recipes + Menu).

## Pipeline settings (Settings → Secrets and variables → Actions)

| Name | Kind | Needed? |
|---|---|---|
| `SANITY_BASE_URL` | Variable | Optional. Empty = test the demo app inside the runner |
| `SANITY_ADMIN_USER` / `_PASSWORD`, `SANITY_CHEF_USER` / `_PASSWORD` | Secrets | Only for a real site |
| `TEAMS_WEBHOOK_URL` | Secret | Optional. Without it the run summary shows the message it would send |

## Adding a test

1. Take the row from the sanity sheet, e.g. `SAN-009`.
2. Add `test('SAN-009 <scenario>', { tag: ['@sanity', '@P1'] }, async ({ page }) => { ... })`.
3. Use `getByRole` / `getByLabel` locators and `expect(...)` for every "Expected Result".
4. `npm test`, then push. The report picks up the ID from the title.
