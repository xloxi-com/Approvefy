import type { LoaderFunctionArgs } from "react-router";

/**
 * Health check endpoint so you can verify the app server is reachable.
 * Open https://approvefy.xloxi.com/health – should return 200 OK.
 */
export const loader = async (_args: LoaderFunctionArgs) => {
  return new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};

export default function Health() {
  return null;
}
