# 5Gshop.pk

Online shop for mobile accessories & gadgets in Pakistan.

**Stack**
- Frontend: static HTML/CSS/JS
- Backend: Cloudflare Worker
- Database: **Cloudflare D1** (all products, orders, settings, admins)
- Deploy: GitHub connected to Cloudflare (**auto deploy** on every push)

**Features**
- Product catalog
- Shopping cart
- Cash on Delivery (COD)
- WhatsApp order button
- Admin panel

## Cloudflare setup (one time)

1. Workers & Pages → create project from this GitHub repo
2. Create D1 database named `5gshop-db`
3. Bind D1 to the Worker as **`DB`**
4. Enable auto deploy from GitHub `main` branch

## Admin

- URL: `/admin`
- Username: `admin`
- Password: `admin123`

Change password and WhatsApp number in Admin → Settings after first login.

All data is stored in **Cloudflare D1** only.
