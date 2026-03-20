import type { LoaderFunctionArgs } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";
import "@shopify/polaris/build/esm/styles.css";
import "./styles/app.css";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- loader must accept LoaderFunctionArgs
export async function loader(_args: LoaderFunctionArgs) {
  return { apiKey: process.env.SHOPIFY_API_KEY ?? "" };
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="shopify-api-key" content={apiKey} />
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://admin.shopify.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.shopify.com" />
        <link rel="dns-prefetch" href="https://admin.shopify.com" />
        <link
          rel="preload"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
          media="print"
          onLoad={(e) => {
            const el = e.currentTarget as HTMLLinkElement;
            el.media = "all";
            el.onload = null;
          }}
        />
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          defer
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
          />
        </noscript>
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
