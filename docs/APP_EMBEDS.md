# App embeds do not show (Approvefy missing in theme editor)

## 1. Confirm the **same** Partner app is installed

You may have **two** Approvefy apps in Shopify Partners (different **Client ID**):

| Config file | Client ID prefix |
|-------------|------------------|
| `shopify.app.toml` | `5a61fbbf…` |
| `shopify.app.customer-b2b.toml` | `545e0ef1…` |

The theme app extension is deployed **per app**. If a store installed `545e…` but you only run `shopify app deploy` (default → `5a61…`), that store will **never** see Approvefy under App embeds.

**Fix:** In the embedded app admin, compare **Client ID** (shown on the Approvefy home setup checklist) to **Partners → Apps → Approvefy → Client ID**. They must match.

- If the store uses **`5a61…`**: `shopify app deploy` then release the version.
- If the store uses **`545e…`**: from a machine logged into the **same Partners org as that app**, run:

  ```bash
  npm run deploy:customer-b2b
  ```

  Then release that version. If you get a 403 organization error, run `shopify auth login` and select the org that owns the `545e…` app.

## 2. Active version must include the theme extension

Partners → your app → **Versions** → open the **Active** version. It should list a **Theme app extension** (e.g. “Approvefy Registration Form”). If it does not, deploy again and **release** the new version.

## 3. Store refresh

After a new version is active, wait a few minutes, then:

1. **Settings → Apps and sales channels → Approvefy → Uninstall** (optional but reliable)
2. Install Approvefy again from the correct install link for that Client ID
3. **Online Store → Themes → Customize → App embeds**

## 4. API / extension version

The theme extension uses `api_version = "2025-10"` in `extensions/registration-form/shopify.extension.toml`, aligned with the app’s Admin API (`October25`). After changing this, deploy and release again.
