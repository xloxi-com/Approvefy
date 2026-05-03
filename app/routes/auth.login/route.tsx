import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";

  return { errors, shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { errors } = actionData || loaderData;
  const shop = actionData?.errors?.shop ? "" : loaderData.shop;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "#f6f6f7",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e3e3e3",
          padding: "1.25rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Log in</h1>
        <p style={{ margin: "0 0 1rem", color: "#616161" }}>
          Enter your shop domain to continue.
        </p>
        <Form method="post">
          <label
            htmlFor="shop"
            style={{
              display: "block",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Shop domain
          </label>
          <input
            id="shop"
            name="shop"
            type="text"
            defaultValue={shop}
            placeholder="example.myshopify.com"
            autoComplete="on"
            style={{
              width: "100%",
              border: "1px solid #c9cccf",
              borderRadius: 8,
              padding: "0.625rem 0.75rem",
              marginBottom: errors.shop ? 6 : 14,
            }}
          />
          {errors.shop && (
            <p style={{ color: "#b42318", margin: "0 0 12px", fontSize: 13 }}>
              {errors.shop}
            </p>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              border: 0,
              borderRadius: 8,
              padding: "0.625rem 0.75rem",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Continue
          </button>
        </Form>
      </div>
    </div>
  );
}
