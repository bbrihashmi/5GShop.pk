function json(data, status) {
  if (status === undefined) status = 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function cookie(name, value, maxAge) {
  if (maxAge === undefined) maxAge = 60 * 60 * 24 * 7;
  return name + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge;
}

function clearCookie(name) {
  return cookie(name, '', 0);
}

async function hash(value) {
  const data = new TextEncoder().encode(String(value));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

function parseCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  const parts = raw.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.indexOf(name + '=') === 0) {
      return decodeURIComponent(p.slice(name.length + 1));
    }
  }
  return '';
}

async function ensureDb(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    db.prepare("CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)"),
    db.prepare("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, compare_price REAL DEFAULT 0, category TEXT DEFAULT '', image TEXT DEFAULT '', stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, phone TEXT DEFAULT '', city TEXT DEFAULT '', address TEXT DEFAULT '', items_json TEXT NOT NULL, total REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
  ]);

  const admin = await db.prepare("SELECT id FROM admins WHERE username = 'admin' LIMIT 1").first();
  if (!admin) {
    await db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').bind('admin', await hash('admin123')).run();
  }

  const defaults = [
    ['store_name', '5Gshop.pk'],
    ['whatsapp', '923001234567'],
    ['currency', 'PKR']
  ];
  for (var i = 0; i < defaults.length; i++) {
    await db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(defaults[i][0], defaults[i][1]).run();
  }

  const count = await db.prepare('SELECT COUNT(*) AS c FROM products').first();
  if (!count || Number(count.c) === 0) {
    const samples = [
      ['Fast USB-C Charger 25W', 1499, 1999, 'Chargers', '', 25],
      ['Braided Type-C Cable 1m', 499, 799, 'Cables', '', 50],
      ['Wireless Earbuds Pro', 3499, 4999, 'Audio', '', 15],
      ['Power Bank 20000mAh', 4299, 5999, 'Power Banks', '', 12],
      ['Phone Holder Car Mount', 899, 1299, 'Accessories', '', 30],
      ['Tempered Glass Protector', 349, 599, 'Accessories', '', 100]
    ];
    for (var j = 0; j < samples.length; j++) {
      var s = samples[j];
      await db.prepare('INSERT INTO products (name, price, compare_price, category, image, stock, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
        .bind(s[0], s[1], s[2], s[3], s[4], s[5]).run();
    }
  }
}

async function adminFrom(req, db) {
  const token = parseCookie(req, 'gs_admin');
  if (!token) return null;
  return await db.prepare('SELECT id, username FROM admins WHERE id = ? AND active = 1').bind(Number(token)).first();
}

async function readBody(req) {
  try { return await req.json(); } catch (e) { return {}; }
}

async function handleApi(req, env, url) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 database not bound. Bind D1 as DB in Cloudflare.' }, 500);
  await ensureDb(db);
  const method = req.method;

  if (url.pathname === '/api/health') return json({ ok: true, database: 'D1', store: '5Gshop.pk' });

  if (url.pathname === '/api/store' && method === 'GET') {
    const products = await db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY id DESC').all();
    const cats = await db.prepare("SELECT DISTINCT category AS name FROM products WHERE active = 1 AND category != '' ORDER BY category").all();
    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    (settingsRows.results || []).forEach(function (row) { settings[row.key] = row.value; });
    return json({
      products: products.results || [],
      categories: (cats.results || []).map(function (c) { return c.name; }),
      settings: settings
    });
  }

  if (url.pathname === '/api/orders' && method === 'POST') {
    const b = await readBody(req);
    const name = String(b.customer_name || '').trim();
    const phone = String(b.phone || '').trim();
    const city = String(b.city || '').trim();
    const address = String(b.address || '').trim();
    const items = Array.isArray(b.items) ? b.items : [];
    if (!name || !phone || !address || !items.length) {
      return json({ error: 'Name, phone, address and items are required' }, 400);
    }
    var total = Number(b.total || 0);
    if (!total) {
      for (var i = 0; i < items.length; i++) {
        total += (Number(items[i].price) || 0) * (Number(items[i].qty) || 1);
      }
    }
    const r = await db.prepare('INSERT INTO orders (customer_name, phone, city, address, items_json, total, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(name, phone, city, address, JSON.stringify(items), total, 'pending').run();
    return json({ ok: true, order_id: r.meta.last_row_id });
  }

  if (url.pathname === '/api/admin/login' && method === 'POST') {
    const b = await readBody(req);
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    const a = await db.prepare('SELECT id, username, password_hash FROM admins WHERE username = ? AND active = 1').bind(username).first();
    if (!a || a.password_hash !== await hash(password)) {
      return json({ error: 'Invalid username or password' }, 401);
    }
    return new Response(JSON.stringify({ ok: true, admin: { id: a.id, username: a.username } }), {
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie('gs_admin', String(a.id))
      }
    });
  }

  if (url.pathname === '/api/admin/logout' && method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json',
        'set-cookie': clearCookie('gs_admin')
      }
    });
  }

  if (url.pathname === '/api/admin/me' && method === 'GET') {
    const a = await adminFrom(req, db);
    return json({ loggedIn: !!a, admin: a || null });
  }

  const admin = await adminFrom(req, db);
  if (url.pathname.indexOf('/api/admin/') === 0 && !admin) {
    return json({ error: 'Admin login required' }, 401);
  }

  if (url.pathname === '/api/admin/dashboard' && method === 'GET') {
    const sales = await db.prepare('SELECT COALESCE(SUM(total), 0) AS value FROM orders').first();
    const orders = await db.prepare('SELECT COUNT(*) AS value FROM orders').first();
    const products = await db.prepare('SELECT COUNT(*) AS value FROM products').first();
    return json({
      sales: Number(sales && sales.value || 0),
      orders: Number(orders && orders.value || 0),
      products: Number(products && products.value || 0)
    });
  }

  if (url.pathname === '/api/admin/products') {
    if (method === 'GET') {
      const r = await db.prepare('SELECT * FROM products ORDER BY id DESC').all();
      return json({ products: r.results || [] });
    }
    const b = await readBody(req);
    if (method === 'POST') {
      const r = await db.prepare('INSERT INTO products (name, price, compare_price, category, image, stock, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
        .bind(String(b.name || ''), Number(b.price || 0), Number(b.compare_price || 0), String(b.category || ''), String(b.image || ''), Number(b.stock || 0)).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (method === 'DELETE') {
      await db.prepare('DELETE FROM products WHERE id = ?').bind(Number(b.id)).run();
      return json({ ok: true });
    }
  }

  if (url.pathname === '/api/admin/orders' && method === 'GET') {
    const r = await db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    return json({ orders: r.results || [] });
  }

  if (url.pathname === '/api/admin/settings') {
    if (method === 'GET') {
      const r = await db.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      (r.results || []).forEach(function (row) { settings[row.key] = row.value; });
      return json({ settings: settings });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      for (var k in b) {
        if (Object.prototype.hasOwnProperty.call(b, k)) {
          await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(k, String(b[k])).run();
        }
      }
      return json({ ok: true });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.indexOf('/api/') === 0) {
        return await handleApi(req, env, url);
      }

      if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html') {
        const asset = await env.ASSETS.fetch(new Request(new URL('/admin.html', url.origin)));
        return new Response(await asset.text(), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
        });
      }

      var path = url.pathname;
      if (path === '/' || path === '') path = '/index.html';
      return env.ASSETS.fetch(new Request(new URL(path, url.origin)));
    } catch (e) {
      return json({ error: 'Server error', detail: String(e && e.message ? e.message : e) }, 500);
    }
  }
};
