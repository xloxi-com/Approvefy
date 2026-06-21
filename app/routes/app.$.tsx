import type { LoaderFunctionArgs } from "react-router";
import { data, useRouteError } from "react-router";

import { AppErrorPage } from "../components/AppErrorPage";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  throw data(null, { status: 404, statusText: "Not Found" });
};

export default function AppCatchAllRoute() {
  return null;
}

export function ErrorBoundary() {
  return <AppErrorPage error={useRouteError()} />;
}
