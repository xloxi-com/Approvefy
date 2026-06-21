import { data, useRouteError } from "react-router";

import { AppErrorPage } from "../components/AppErrorPage";

export const loader = async () => {
  throw data(null, { status: 404, statusText: "Not Found" });
};

export default function RootCatchAllRoute() {
  return null;
}

export function ErrorBoundary() {
  return <AppErrorPage error={useRouteError()} homePath="/" />;
}
