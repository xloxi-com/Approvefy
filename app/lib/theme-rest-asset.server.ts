import { apiVersion } from "../shopify.server";
import { themeNumericIdFromGid } from "./theme-cli-push.server";

function isThemeWriteAccessDenied(message: string | undefined | null): boolean {
  return /access denied|required access|not authorized|exemption|write_themes/i.test(
    message ?? "",
  );
}

/** Legacy Theme REST asset API — fallback when GraphQL themeFilesUpsert is blocked. */
export async function putThemeAssetViaRest(
  shop: string,
  accessToken: string,
  themeGid: string,
  assetKey: string,
  value: string,
): Promise<{ ok: boolean; accessDenied: boolean; error?: string }> {
  const token = accessToken.trim();
  const themeNumericId = themeNumericIdFromGid(themeGid);
  if (!shop || !token || !themeNumericId || !assetKey.trim()) {
    return { ok: false, accessDenied: false, error: "Missing shop, token, theme, or asset key" };
  }

  const url = `https://${shop}/admin/api/${apiVersion}/themes/${themeNumericId}/assets.json`;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        asset: {
          key: assetKey,
          value,
        },
      }),
    });

    const text = await res.text();
    let json: { errors?: string | Record<string, unknown>; asset?: { key?: string } } = {};
    if (text.trim()) {
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        json = {};
      }
    }

    if (res.ok && json.asset?.key === assetKey) {
      return { ok: true, accessDenied: false };
    }

    const errorMessage =
      typeof json.errors === "string"
        ? json.errors
        : json.errors
          ? JSON.stringify(json.errors)
          : text.trim() || `Theme asset PUT failed (${res.status})`;

    const accessDenied =
      res.status === 401 ||
      res.status === 403 ||
      isThemeWriteAccessDenied(errorMessage);

    console.warn("[ThemeRestAsset] putThemeAssetViaRest failed:", errorMessage);
    return { ok: false, accessDenied, error: errorMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[ThemeRestAsset] putThemeAssetViaRest error:", message);
    return { ok: false, accessDenied: false, error: message };
  }
}
