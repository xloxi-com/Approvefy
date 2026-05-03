import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * Shopify Admin appends `?appLoadId=<uuid>` when opening an embedded app.
 * It is only used for load correlation; we strip it from the iframe URL with `replace`
 * so the visible URL is clean (other query params like `shop` / `host` stay intact).
 */
export function StripAppLoadId() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("appLoadId")) return;
    params.delete("appLoadId");
    const next = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: next ? `?${next}` : "",
        hash: location.hash,
      },
      { replace: true }
    );
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
