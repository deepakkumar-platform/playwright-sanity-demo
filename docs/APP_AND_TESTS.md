# Kitchen Portal: the app, its flows, and the sanity tests

1. [What the app is](#1-what-the-app-is)
2. [Running it](#2-running-it)
3. [Users and profiles](#3-users-and-profiles)
4. [Screens](#4-screens)
5. [Flows: login, session, access, logout](#5-flows)
6. [The code, function by function](#6-the-code-function-by-function)
7. [The test cases](#7-the-test-cases)
8. [How the test code is built](#8-how-the-test-code-is-built)
9. [The pipeline and the laptop deploy](#9-the-pipeline-and-the-laptop-deploy)
10. [Demo shortcuts (don't copy into a real app)](#10-demo-shortcuts-dont-copy-into-a-real-app)

---

## 1. What the app is

A tiny food-service back office, built only so there is something real to test. It has the same kind of screens as the sanity sheet: login, profile-based module access, recipes with nutrition, a weekly menu, a product master and inventory.

| | |
|---|---|
| Tech | Node.js 22 + Express 5, HTML rendered on the server, no JavaScript in the browser |
| Data | In memory (`app/data.js`). Nothing is saved, and a restart resets everything |
| Files | `app/server.js` (routes and logic, ~130 lines), `app/data.js` (users and records) |
| Health check | `GET /health` → `{"status":"ok"}`. Used by the deploy script and by Playwright |

## 2. Running it

| Where | Command | URL |
|---|---|---|
| Your editor, while writing tests | `npm start` | http://localhost:3000 |
| Deployed by the pipeline to your laptop | (the `deploy` job) | http://localhost:5100 |
| Inside a GitHub VM (target = github) | started by Playwright's `webServer` | http://localhost:3000 on the VM |

The two ports mean the deployed copy and your development copy can both run at once.

Environment variables the app reads:

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DEMO_BUG` | empty | `nutrition` → recipe pages show 0 calories, so SAN-008 fails. Demo only |

## 3. Users and profiles

| Username | Password | Name | Profile | Modules |
|---|---|---|---|---|
| `qa.admin` | `demo-admin` | QA Admin | Administrator | Recipes, Menu, Products, Inventory |
| `qa.chef` | `demo-chef` | QA Chef | Chef | Recipes, Menu |

A **profile** decides which **modules** a user can open. This is the same idea as SAN-002 in the sheet ("user can access only the modules permitted by the assigned profile").

## 4. Screens

| URL | Who can open it | What it shows |
|---|---|---|
| `/` | anyone | Redirects to `/dashboard` when logged in, otherwise `/login` |
| `/login` | anyone | Username + password form. A wrong login shows *"Invalid username or password"* (HTTP 401) |
| `/dashboard` | logged in | "Welcome, *name*", the profile, and a link list of *your* modules |
| `/recipes` | Recipes module | Recipe table (name, category, servings) + search box |
| `/recipes/101` | Recipes module | One recipe: **Details** (category, servings, meal type), **Nutrition per serving** (calories, protein), **Allergens** |
| `/menu` | Menu module | Weekly menu table: Day, Meal, Item |
| `/products` | Products module | Product table (SKU, name, category, unit) + search by name or SKU |
| `/inventory` | Inventory module | Stock per storage area |
| `/logout` | anyone | Clears the session cookie → `/login` |
| `/health` | anyone | `{"status":"ok"}` |

A user who opens a module their profile doesn't include (e.g. the chef typing `/inventory`) gets **"Access denied"** (HTTP 403). A logged-out user opening any page is sent to `/login`.

Records the tests rely on (from `app/data.js`):

| Record | Values the tests check |
|---|---|
| Recipe 101 Chicken Biryani | Entree, Lunch, 10 servings, **520 kcal**, **28 g** protein, allergen Dairy |
| Menu | **Monday Lunch = Chicken Biryani**, Monday Breakfast = Masala Oats, Tuesday Lunch = Veg Pulao |
| Product P-1001 | **Basmati Rice 10kg**, Grains, unit **Bag** |
| Inventory | **Dry Store: Basmati Rice 10kg**, 14 on hand |

## 5. Flows

### Login
```
Browser                           Server (app/server.js)
  │ GET /login ─────────────────────▶ loginForm()  → empty form
  │ POST /login  username+password ─▶ find user in data.users
  │                                     ├─ not found → 401 + form with "Invalid username or password"
  │                                     └─ found     → sid = random UUID
  │                                                    sessions[sid] = user
  │ ◀── 302 /dashboard + Set-Cookie: sid=<uuid>; HttpOnly; SameSite=Lax
  │ GET /dashboard (cookie: sid) ───▶ requireLogin → user from sessions[sid] → page
```

### Every later request
```
request ─▶ requireLogin ──(no/unknown sid)──▶ 302 /login
              │ user found
              ▼
          requireModule('recipes') ──(not in user.modules)──▶ 403 "Access denied"
              │ allowed
              ▼
          route handler → HTML page with the nav bar for this user's modules
```

### Logout
`GET /logout` → cookie set to expire (`Max-Age=0`) → `/login`. (The server doesn't delete the session entry. That's fine for a demo; see section 10.)

## 6. The code, function by function

`app/server.js`:

| Function / route | What it does |
|---|---|
| `esc(s)` | HTML-escapes text before putting it in a page (`<` → `&lt;` …). Stops a search like `<script>` from running |
| `page(title, body, user)` | Wraps every page in the same layout: `<title>`, header, and when logged in, a `<nav aria-label="Modules">` with one link per allowed module plus Log out |
| `currentUser(req)` | Reads the `sid` cookie and looks it up in the `sessions` map |
| `requireLogin` | Middleware: no user → redirect to `/login`, otherwise puts the user on `req.user` |
| `requireModule(m)` | Middleware factory: user's profile lacks module `m` → 403 Access denied |
| `loginForm(error)` | The login form. `<label for=…>` on each input, so tests can use `getByLabel('Username')`. The error is a `role="alert"` paragraph |
| `POST /login` | Checks username + password, creates the session, sets the cookie, redirects |
| `GET /recipes` | Filters recipes by `?q=` (case-insensitive substring) |
| `GET /recipes/:id` | Each block is a `<section aria-labelledby=…>`, which makes it a **region** that `getByRole('region', { name: 'Nutrition per serving' })` can find. `DEMO_BUG=nutrition` replaces calories with 0 here |
| `GET /products` | Filters by name **or** SKU |
| `app.listen` | Starts on `PORT`, and logs when a demo bug is on |

Why the HTML looks the way it does: labels, headings, `role="alert"`, `aria-label` and table rows are what **accessible locators** use. An app that's easy to test this way is also easier to use with a screen reader. If the real app lacks these, the tests fall back to `getByTestId` (ask the developers to add `data-testid`) or CSS selectors.

## 7. The test cases

Every title starts with the sheet ID. Every test is tagged `@sanity` and a priority (`@P1`).

| ID | Test | Sheet row it covers | Steps | Expected (the `expect` lines) |
|---|---|---|---|---|
| SAN-001 | Log in and landing page loads | SAN-001 Application Access | Log in as admin | Dashboard heading, "Welcome, QA Admin", URL ends with `/dashboard` |
| SAN-001 | Wrong password shows an error | SAN-001 (negative case) | Real username, wrong password | Alert text is exactly "Invalid username or password" |
| SAN-002 | User sees only the modules of their profile | SAN-002 User Management / Access | Log in as chef, then type `/inventory` | "Profile: Chef"; nav has Recipes + Menu; **no** Inventory link; `/inventory` shows "Access denied" |
| SAN-005 | Search a product and see its setup | SAN-005 Product Master | Products → search "basmati" | Basmati row contains SKU P-1001 and unit Bag |
| SAN-006 | Open a recipe and see its details | SAN-006 Recipe open | Recipes → click Chicken Biryani | H1 = Chicken Biryani; Details and Allergens sections; "Meal type: Lunch" |
| SAN-008 | Recipe nutrition values are correct | SAN-008 Recipe calculations | Open recipe 101 | Calories row has "520 kcal", Protein row "28 g" |
| SAN-010 | Menu shows saved items on the right day | SAN-010 Menu save and display | Open Menu | "Monday Lunch" row contains Chicken Biryani |
| SAN-014 | Inventory screen loads for an allowed user | SAN-014 Inventory access | Admin opens Inventory | Inventory heading; Dry Store row has Basmati Rice 10kg |

Files: SAN-001 and SAN-002 are in `tests/sanity/access.spec.ts`, which logs in differently per test. The rest are in `tests/sanity/modules.spec.ts`, which logs in as admin in `beforeEach`.

### What each test protects against

| Test | Fails when… |
|---|---|
| SAN-001 login | Login is broken, the dashboard errors, the redirect goes somewhere else |
| SAN-001 wrong password | Bad logins get in, or no error is shown (or the error text changed) |
| SAN-002 | A profile shows a module it shouldn't, **or** the menu hides it but the URL still works. That's why the test also types the URL directly: hiding a link isn't security |
| SAN-005 | Search broken, product master data missing or changed |
| SAN-006 | Recipe list → detail navigation broken, sections missing |
| SAN-008 | Nutrition calculation wrong (this is the one `DEMO_BUG` breaks) |
| SAN-010 | Menu items saved on the wrong day, or missing |
| SAN-014 | Inventory page broken for a user who should see it (SAN-002 covers the user who shouldn't) |

### The sheet rows not automated here, and why
SAN-003/004 (account/vendor), 007 (workflow validation), 009, 011–013 (menu planning, purchase), 015–017: this demo app doesn't have those screens. In the real app, start with read-only P1 rows. Rows that **create data** (purchase orders, notifications, sheet GAP-003) need a safe environment and test data, or they shouldn't run on every push.

## 8. How the test code is built

| Piece | Role |
|---|---|
| `playwright.config.ts` | `baseURL` from `BASE_URL` (or localhost:3000). If `BASE_URL` is empty, `webServer` starts the app and waits for `/health`. In CI: `retries: 1`, `forbidOnly`, 2 workers. Reporters: list, html, junit, json. Screenshot/video/trace kept only for failures |
| `tests/helpers/login.ts` | `users` comes from `SANITY_*` env vars (secrets in CI), and falls back to the demo users. `login(page, 'admin' \| 'chef')` fills the form and waits for the Dashboard heading, so a broken login fails here with a clear message |
| `test(title, { tag }, fn)` | The tag is how `--grep @sanity` picks the sanity set |
| Locators | `getByRole`, `getByLabel`, `getByText`: what a user sees, not CSS classes |
| `expect(locator).toHaveText / toContainText / toBeVisible / toHaveCount(0)` | **Web-first assertions**: Playwright retries them for up to 5 s (`expect.timeout`), so there's no need for `sleep` |
| `scripts/sanity-summary.mjs` | Reads `results/results.json` and writes the summary table, `results/sanity-results.csv` (the sheet's columns) and step outputs for the Teams message |

Useful commands:
```bash
npx playwright test --grep SAN-008       # one test case
npx playwright test --headed             # watch it
npx playwright test --ui                 # step through, time-travel
npx playwright test --debug              # pause on each step
npx playwright codegen localhost:3000    # record clicks → code
npx playwright show-trace test-results/<dir>/trace.zip
```

## 9. The pipeline and the laptop deploy

```
plan (GitHub VM) ──▶ deploy (your laptop) ──▶ sanity (your laptop) ──▶ notify (GitHub VM)
  decides target,      stop, back up, copy,     npm ci, Chromium,        Teams card, or a
  deploy yes/no, URL   start, health check,     tests http://localhost   notice when no
                       roll back if unhealthy   :5100, report            webhook is set
```

| Trigger | Deploy to laptop | Tests run on | Tests open |
|---|---|---|---|
| push to `main` | yes | laptop | http://localhost:5100 |
| schedule (07:00 IST daily) | no | laptop | the app already deployed |
| manual, target = laptop | if "deploy" is ticked | laptop | http://localhost:5100 |
| manual, target = github | no | GitHub VM | app started inside the job |

Repo variable `SANITY_TARGET=github` makes push and schedule use the GitHub VM. That's useful when the laptop will be off; otherwise jobs wait in the queue until the runner is online.

**The deploy** (`scripts/deploy-laptop.sh`), the same steps as an IIS deploy:

| Step | On the laptop |
|---|---|
| 1. Stop | Kills the PID in `~/apps/kitchen-portal/app.pid` |
| 2. Back up | Copies the live folder to `~/apps/kitchen-portal-backups/run-<N>`, keeps the newest 3 |
| 3. Copy | `app/`, production `node_modules/`, `package.json` → `~/apps/kitchen-portal/` |
| 4. Start | `setsid nohup node app/server.js` with `RUNNER_TRACKING_ID=""`, so the app keeps running after the job ends (the runner kills a job's processes otherwise) |
| 5. Health check | `/health` must answer within 10 s |
| 6. Roll back | If unhealthy: print the log, restore the backup, start it, fail the job |

`environment: laptop` on the deploy job makes each deploy appear under the repo's **Deployments** list, with the URL.

Runner: `~/actions-runner-sanity` (name `fedora-laptop-sanity`, label `sanity-laptop`). It's separate from `~/actions-runner`, which belongs to the dotnet demo repo; on a personal account a runner serves one repo.
```bash
cd ~/actions-runner-sanity && ./run.sh                 # start (leave the terminal open)
curl localhost:5100/health                             # is the deployed app up?
tail -f ~/apps/kitchen-portal/app.log                  # its log
kill "$(cat ~/apps/kitchen-portal/app.pid)"            # stop the deployed app
```

Security note: this repo is public, and a self-hosted runner runs whatever the workflow says. The workflow has **no `pull_request` trigger**, so a stranger's fork PR can't run code on your laptop. Keep it that way (and keep *Settings → Actions → Fork pull request workflows* on "require approval").

## 10. Demo shortcuts (don't copy into a real app)

| Shortcut | Real app would… |
|---|---|
| Plain-text passwords in `data.js` | Store salted hashes (bcrypt/argon2), and keep test users' passwords in secrets |
| Sessions in a JS `Map` (lost on restart; logout doesn't delete them) | Use a session store or signed tokens with expiry, and delete the session on logout |
| No CSRF protection on the login form | Use CSRF tokens |
| `DEMO_BUG` switch | Doesn't exist. Real failures come from real code changes |
