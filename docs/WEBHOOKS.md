# Webhooks & theme extension deploy

## Why Approvefy did not appear under **App embeds**

New app versions are created when you run `shopify app deploy`. If that command fails, **no extension update** is published—including the theme app extension that powers App embeds.

Declaring `customers/create` in `shopify.app.toml` requires **[Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)** approval. Until Shopify approves your app for that program, version creation can fail with:

> This app is not approved to subscribe to webhook topics containing protected customer data.

So the theme extension never shipped, and the theme editor showed *“You don't have any apps with embeds installed.”*

## What we changed

The `customers/create` subscription was **removed from `shopify.app.toml`** so `shopify app deploy` can succeed and the **registration-form** theme app extension is included in the app version.

The handler route **`/webhooks/customers_create`** is still in the codebase for when the subscription exists.

## Registration flows

- **Approvefy registration (app proxy / theme embed)** — handled in `app/routes/api.register.tsx`; does **not** depend on `customers/create`.
- **Native Shopify customer registration** (default theme form without your flow) — tagging `status:pending` via `customers/create` only runs if that webhook is subscribed.

## After Protected Customer Data approval

1. Complete the questionnaire in the **Partner Dashboard** for your app.
2. Add this block back to `shopify.app.toml` under `[webhooks]`:

```toml
  [[webhooks.subscriptions]]
  topics = [ "customers/create" ]
  uri = "/webhooks/customers_create"
```

3. Run `shopify app deploy` again so managed install picks up the subscription.

## Multiple app configs

If you use `shopify.app.customer-b2b.toml`, deploy with the config that matches the **Client ID** stores actually install:

`shopify app deploy --config shopify.app.customer-b2b.toml`
