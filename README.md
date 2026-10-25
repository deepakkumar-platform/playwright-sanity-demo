# Playwright sanity tests + GitHub Actions (demo)

A small "Kitchen Portal" web app, Playwright sanity tests named after the sanity sheet IDs (SAN-001 …), and a pipeline that:

| Requirement | How |
|---|---|
| Run on every push | `on: push` (branch `main`) |
| Run once every 24 hours | `on: schedule`, `30 1 * * *` = 07:00 IST |
| Report for pass **and** fail | Run summary table + `playwright-report` (HTML) + `sanity-results` (CSV / JUnit) artifacts |
| Notify the team every run | `notify` job → Teams Adaptive Card (or a notice when the webhook isn't set) |

On every push the app is also **deployed to a laptop** (self-hosted runner) and the tests run against it at http://localhost:5100:

```
plan (GitHub VM) → deploy (laptop) → sanity (laptop) → notify (GitHub VM)
```

Full explanation of the app, its login and access flows, every test case and the deploy: **[docs/APP_AND_TESTS.md](docs/APP_AND_TESTS.md)**.

## Layout

```
app/                         demo web app (Express, in-memory data)
tests/helpers/login.ts       login helper; users from env/secrets
tests/sanity/*.spec.ts       the sanity tests, tagged @sanity
playwright.config.ts         reporters, retries, screenshots/trace, starts the app when BASE_URL is empty
scripts/sanity-summary.mjs   results.json → summary table, CSV, step outputs
scripts/deploy-laptop.sh     stop → back up → copy → start → health check → roll back
.github/workflows/sanity-tests.yml
.github/actionlint.yaml      tells actionlint about the custom runner label
docs/APP_AND_TESTS.md        the app, flows, test cases, deploy
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

## Deploy to the laptop

| Trigger | Deploy | Tests run on | Tests open |
|---|---|---|---|
| push to `main` | yes | laptop | http://localhost:5100 |
| schedule (daily) | no | laptop | the app already deployed |
| manual, target = laptop | if "deploy" is ticked | laptop | http://localhost:5100 |
| manual, target = github | no | GitHub VM | app started inside the job |

The runner needs the label `sanity-laptop` and must be running (`./run.sh` in its folder). If it's offline, laptop jobs wait in the queue. The deployed app lives in `~/apps/kitchen-portal` (log: `app.log`, stop: `kill "$(cat ~/apps/kitchen-portal/app.pid)"`), with the last 3 versions in `~/apps/kitchen-portal-backups`.

The workflow has no `pull_request` trigger, so fork PRs can't run code on the self-hosted runner. Keep it that way.

## Pipeline settings (Settings → Secrets and variables → Actions)

| Name | Kind | Needed? |
|---|---|---|
| `SANITY_TARGET` | Variable | Optional. `github` = push/schedule test inside a GitHub VM (laptop off). Default `laptop` |
| `SANITY_BASE_URL` | Variable | Optional, target=github only. Empty = test the demo app inside the runner |
| `SANITY_ADMIN_USER` / `_PASSWORD`, `SANITY_CHEF_USER` / `_PASSWORD` | Secrets | Only for a real site |
| `TEAMS_WEBHOOK_URL` | Secret | Optional. Without it the run summary shows the message it would send |

## Adding a test

1. Take the row from the sanity sheet, e.g. `SAN-009`.
2. Add `test('SAN-009 <scenario>', { tag: ['@sanity', '@P1'] }, async ({ page }) => { ... })`.
3. Use `getByRole` / `getByLabel` locators and `expect(...)` for every "Expected Result".
4. `npm test`, then push. The report picks up the ID from the title.
