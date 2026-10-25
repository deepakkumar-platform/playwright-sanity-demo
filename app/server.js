// Kitchen Portal: a tiny demo app for the Playwright sanity tests.
// In-memory data, no database. Not for real use.
const express = require('express');
const crypto = require('crypto');
const data = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;
// DEMO_BUG=nutrition shows wrong calories, so a sanity test fails on purpose
const DEMO_BUG = process.env.DEMO_BUG || '';
const sessions = new Map();

app.use(express.urlencoded({ extended: false }));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body, user) {
  const nav = user
    ? `<nav aria-label="Modules"><a href="/dashboard">Dashboard</a> ${user.modules
        .map((m) => `<a href="/${m}">${data.moduleNames[m]}</a>`)
        .join(' ')} <a href="/logout">Log out</a></nav>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · Kitchen Portal</title>
<style>body{font-family:system-ui;margin:2rem;max-width:900px}nav a{margin-right:1rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3rem .6rem}[role=alert]{color:#b00}</style>
</head><body><header><strong>Kitchen Portal</strong></header>${nav}<main>${body}</main></body></html>`;
}

function currentUser(req) {
  const sid = (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === 'sid')?.[1];
  return sid ? sessions.get(sid) : undefined;
}

function requireLogin(req, res, next) {
  req.user = currentUser(req);
  if (!req.user) return res.redirect('/login');
  next();
}

function requireModule(module) {
  return (req, res, next) => {
    if (!req.user.modules.includes(module)) {
      return res.status(403).send(page('Access denied', '<h1>Access denied</h1><p>Your profile cannot open this module.</p>', req.user));
    }
    next();
  };
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', (req, res) => res.redirect(currentUser(req) ? '/dashboard' : '/login'));

app.get('/login', (req, res) => res.send(page('Log in', loginForm())));

function loginForm(error) {
  return `<h1>Log in</h1>${error ? `<p role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/login">
<p><label for="username">Username</label> <input id="username" name="username" autocomplete="username"></p>
<p><label for="password">Password</label> <input id="password" name="password" type="password" autocomplete="current-password"></p>
<button type="submit">Log in</button></form>`;
}

app.post('/login', (req, res) => {
  const user = data.users.find((u) => u.username === req.body.username && u.password === req.body.password);
  if (!user) return res.status(401).send(page('Log in', loginForm('Invalid username or password')));
  const sid = crypto.randomUUID();
  sessions.set(sid, user);
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/`);
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
  res.redirect('/login');
});

app.get('/dashboard', requireLogin, (req, res) => {
  const u = req.user;
  res.send(page('Dashboard', `<h1>Dashboard</h1><p>Welcome, ${esc(u.displayName)}</p><p>Profile: <strong>${esc(u.profile)}</strong></p>
<h2>Your modules</h2><ul>${u.modules.map((m) => `<li><a href="/${m}">${data.moduleNames[m]}</a></li>`).join('')}</ul>`, u));
});

app.get('/recipes', requireLogin, requireModule('recipes'), (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const rows = data.recipes.filter((r) => r.name.toLowerCase().includes(q));
  res.send(page('Recipes', `<h1>Recipes</h1>
<form><label for="q">Search recipes</label> <input id="q" name="q" value="${esc(req.query.q || '')}"> <button>Search</button></form>
<table><thead><tr><th>Recipe</th><th>Category</th><th>Servings</th></tr></thead><tbody>
${rows.map((r) => `<tr><td><a href="/recipes/${r.id}">${esc(r.name)}</a></td><td>${esc(r.category)}</td><td>${r.servings}</td></tr>`).join('')}
</tbody></table>${rows.length ? '' : '<p>No recipes found</p>'}`, req.user));
});

app.get('/recipes/:id', requireLogin, requireModule('recipes'), (req, res) => {
  const r = data.recipes.find((x) => String(x.id) === req.params.id);
  if (!r) return res.status(404).send(page('Not found', '<h1>Recipe not found</h1>', req.user));
  const calories = DEMO_BUG === 'nutrition' ? 0 : r.calories;
  res.send(page(r.name, `<h1>${esc(r.name)}</h1>
<section aria-labelledby="details"><h2 id="details">Details</h2><p>Category: ${esc(r.category)}</p><p>Servings: ${r.servings}</p><p>Meal type: ${esc(r.mealType)}</p></section>
<section aria-labelledby="nutrition"><h2 id="nutrition">Nutrition per serving</h2>
<table><tbody><tr><th>Calories</th><td>${calories} kcal</td></tr><tr><th>Protein</th><td>${r.protein} g</td></tr></tbody></table></section>
<section aria-labelledby="allergens"><h2 id="allergens">Allergens</h2><p>${r.allergens.length ? r.allergens.map(esc).join(', ') : 'None'}</p></section>`, req.user));
});

app.get('/menu', requireLogin, requireModule('menu'), (req, res) => {
  res.send(page('Weekly menu', `<h1>Weekly menu</h1>
<table><thead><tr><th>Day</th><th>Meal</th><th>Item</th></tr></thead><tbody>
${data.menu.map((m) => `<tr><td>${m.day}</td><td>${m.meal}</td><td>${esc(m.item)}</td></tr>`).join('')}
</tbody></table>`, req.user));
});

app.get('/products', requireLogin, requireModule('products'), (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const rows = data.products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  res.send(page('Products', `<h1>Products</h1>
<form><label for="q">Search products</label> <input id="q" name="q" value="${esc(req.query.q || '')}"> <button>Search</button></form>
<table><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Unit</th></tr></thead><tbody>
${rows.map((p) => `<tr><td>${p.sku}</td><td>${esc(p.name)}</td><td>${p.category}</td><td>${p.unit}</td></tr>`).join('')}
</tbody></table>`, req.user));
});

app.get('/inventory', requireLogin, requireModule('inventory'), (req, res) => {
  res.send(page('Inventory', `<h1>Inventory</h1>
<table><thead><tr><th>Storage area</th><th>Product</th><th>On hand</th></tr></thead><tbody>
${data.inventory.map((i) => `<tr><td>${i.area}</td><td>${esc(i.product)}</td><td>${i.qty}</td></tr>`).join('')}
</tbody></table>`, req.user));
});

app.listen(PORT, () => console.log(`Kitchen Portal on http://localhost:${PORT}${DEMO_BUG ? ` (DEMO_BUG=${DEMO_BUG})` : ''}`));
