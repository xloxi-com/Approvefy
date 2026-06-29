/** OAuth scopes Approvefy must request on every install / re-auth (includes all-theme write). */
export const APP_OAUTH_SCOPES = [
  "read_customers",
  "read_locales",
  "read_online_store_pages",
  "read_themes",
  "write_app_proxy",
  "write_customers",
  "write_online_store_pages",
  "write_products",
  "write_themes",
] as const;

export const WRITE_THEMES_SCOPE = "write_themes";

/** Runtime scopes: always merge env with required list so write_themes is never dropped. */
export function resolveAppOAuthScopes(): string[] {
  const envScopes =
    process.env.SCOPES?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return [...new Set([...APP_OAUTH_SCOPES, ...envScopes])];
}

export function sessionHasWriteThemesScope(scope: string | null | undefined): boolean {
  if (!scope?.trim()) return false;
  const granted = scope.split(",").map((s) => s.trim().toLowerCase());
  return granted.includes(WRITE_THEMES_SCOPE);
}
