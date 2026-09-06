# 5GShop.pk

Online shop for mobile accessories & gadgets in Pakistan.

**Features**
- Product catalog
- Shopping cart
- Cash on Delivery (COD)
- WhatsApp order button
- Admin panel (add/edit products, view orders)

## Deploy on Cloudflare (simple)

1. Go to https://dash.cloudflare.com → **Workers & Pages**
2. Create a new Worker, or connect this GitHub repo
3. Create a **D1 database** named `5gshop-db`
4. Bind it in the Worker settings as `DB`
5. Deploy

Default admin login:
- Username: `admin`
- Password: `admin123`

Change the password after first login.

WhatsApp number is set in Admin → Settings.
