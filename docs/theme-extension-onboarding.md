## Approvefy Theme Extension Onboarding

Follow these steps after installing Approvefy to enable the theme app extension correctly.

### 1) Open Theme Editor

1. In Shopify admin, go to `Online Store` -> `Themes`.
2. On your current published theme, click `Customize`.

### 2) Enable the Approvefy App Embed

1. In the theme editor, open `App embeds` (left sidebar).
2. Find `Approvefy Form Embed`.
3. Toggle it `On`.
4. Click `Save`.

### 3) Configure the Registration Form

1. In Shopify admin, open the Approvefy app.
2. Go to `Form Builder`.
3. Copy the `Form ID` from the form you want to show.
4. Return to theme editor -> `App embeds` -> `Approvefy Form Embed`.
5. Paste the `Form ID` in the `Form to display` setting.
6. Click `Save`.

### 4) Verify on Storefront

1. Open your storefront registration page (usually `/account/register`).
2. Confirm the Approvefy registration fields render.
3. Submit a test registration and confirm it appears in Approvefy `Customers`.

### 5) Troubleshooting

- If fields do not appear, confirm the app embed is enabled on the currently published theme.
- If using a different theme, repeat the embed enablement for that theme.
- If form data is missing, verify the `Form ID` value is valid and saved.
- If changes do not appear immediately, clear cache and hard refresh the storefront page.

