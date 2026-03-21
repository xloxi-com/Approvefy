# Supabase schema (used with .env)

The app connects to **Supabase Postgres** using `.env`:

- **DATABASE_URL** – used by Prisma for queries
- **DIRECT_URL** – used by Prisma for migrations

## 1. Set up .env

Copy the example and add your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `DATABASE_URL` – from Supabase: **Project Settings → Database → Connection string (URI)**
- `DIRECT_URL` – same URI (or use the “Direct connection” string for migrations)

## 2. Apply the schema

**Option A – Supabase Dashboard**

1. Open your project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor**.
3. Paste the contents of `schema.sql` and run it.

**Option B – Prisma (recommended)**

Prisma will create/update tables when you run migrations. The schema in `prisma/schema.prisma` is the source of truth; `supabase/schema.sql` is a mirror for reference or manual runs.

```bash
npx prisma migrate dev
# or to only push schema without migration history:
npx prisma db push
```

This uses `DATABASE_URL` and `DIRECT_URL` from `.env`.

## 3. Fix: Template selection not persisting after refresh

If the selected email template (e.g. "Empathetic", "B2B formal") reverts to "Custom" after a page refresh:

1. In Supabase **SQL Editor**, run the script **`fix-template-persistence.sql`** (in this folder).  
   It ensures `AppSettings.customerApprovalSettings` (JSONB) and the `EmailTemplate` table exist.
2. In the app: choose your template, then click the main **Save** at the bottom of the page (not only Save in the modal).  
   The selected template and preset id are stored in `customerApprovalSettings` and in `EmailTemplate`.

## 4. Tables (match Prisma)

| Table         | Purpose                          |
|---------------|----------------------------------|
| Session       | Shopify session storage          |
| Registration  | B2B customer registrations       |
| AppSettings   | Language options, form translations, **customerApprovalSettings** (email template + preset id) |
| B2BSettings   | B2B approval settings            |
| FormConfig    | Form builder fields per shop      |
| SmtpSettings  | SMTP config per shop             |
| EmailTemplate | Rejection/approval email body per shop (slug: `rejection`, `approval`) |
