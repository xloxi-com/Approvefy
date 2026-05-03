import type { LinksFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import polarisStylesHref from "@shopify/polaris/build/esm/styles.css?url";
import appStylesHref from "./styles/app.css?url";

export const links: LinksFunction = () => [
  // Preload critical CSS to reduce first paint delay.
  { rel: "preload", href: polarisStylesHref, as: "style" },
  { rel: "preload", href: appStylesHref, as: "style" },
  { rel: "stylesheet", href: polarisStylesHref },
  { rel: "stylesheet", href: appStylesHref },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.shopify.com" />
        <style>{`
          /* Critical token fallbacks: avoid square flash before Polaris AppProvider sets CSS variables */
          :root {
            --p-border-radius-050: 2px;
            --p-border-radius-100: 4px;
            --p-border-radius-150: 6px;
            --p-border-radius-200: 8px;
            --p-border-radius-300: 12px;
            --p-border-radius-400: 16px;
            --p-border-radius-500: 20px;
          }

          /* Legacy / old markup: token-based radius only (no ShadowBevel here — see below). */
          .Polaris-Card,
          .Polaris-LegacyCard,
          .Polaris-LegacyCard__Section {
            border-radius: var(--p-border-radius-300);
          }

          /*
           * ShadowBevel: match Polaris (border-radius uses --pc-shadow-bevel-border-radius from SSR).
           * Avoid a hardcoded 12px layer that fights SSR inline + the post-layout breakpoint flip.
           */
          .Polaris-ShadowBevel {
            border-radius: var(
              --pc-shadow-bevel-border-radius,
              var(--p-border-radius-300)
            );
          }
        `}</style>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
