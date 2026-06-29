import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const shop = process.env.SHOPIFY_SHOP || "test-kqnmlfaz.myshopify.com";
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  if (!session?.accessToken) {
    console.log("NO_OFFLINE_TOKEN", { shop });
    return;
  }
  console.log("SCOPE", session.scope);
  console.log("HAS_WRITE_THEMES", (session.scope || "").includes("write_themes"));

  const themesRes = await fetch(`https://${shop}/admin/api/2025-10/themes.json`, {
    headers: { "X-Shopify-Access-Token": session.accessToken },
  });
  const themesJson = await themesRes.json();
  const main = themesJson.themes?.find((t) => t.role === "main");
  console.log("MAIN_THEME", main?.id, main?.name);

  if (!main?.id) return;

  const templatePath = path.join(
    process.cwd(),
    "theme/approvefy-registration/templates/page.customer-registration.json",
  );
  const value = fs.readFileSync(templatePath, "utf8");

  const putRes = await fetch(
    `https://${shop}/admin/api/2025-10/themes/${main.id}/assets.json`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        asset: { key: "templates/page.customer-registration.json", value },
      }),
    },
  );
  const putText = await putRes.text();
  console.log("REST_PUT_STATUS", putRes.status);
  console.log("REST_PUT_BODY", putText.slice(0, 500));

  for (const ver of ["2024-10", "2024-07", "2024-04"]) {
    const r = await fetch(
      `https://${shop}/admin/api/${ver}/themes/${main.id}/assets.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          asset: { key: "templates/page.customer-registration.json", value },
        }),
      },
    );
    const t = await r.text();
    console.log(`REST_${ver}`, r.status, t.slice(0, 200));
  }

  const gqlRes = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({
      query: `mutation($themeId: ID!, $files: [ThemeFilesCopyFileInput!]!) {
        themeFilesCopy(themeId: $themeId, files: $files) {
          copiedThemeFiles { filename }
          userErrors { message }
        }
      }`,
      variables: {
        themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
        files: [
          {
            srcFilename: "templates/page.json",
            dstFilename: "templates/page.customer-registration.json",
          },
        ],
      },
    }),
  });
  const gqlJson = await gqlRes.json();
  console.log("COPY_RESULT", JSON.stringify(gqlJson, null, 2).slice(0, 800));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
