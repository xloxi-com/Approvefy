import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * Default app entry opens Customers (merchant request). Setup guide lives at /app/home.
 * Parent `app.tsx` loader authenticates before this runs.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const search = url.searchParams.toString();
  throw redirect(search ? `/app/customers?${search}` : "/app/customers");
};

export default function AppIndexRedirect() {
  return null;
}
