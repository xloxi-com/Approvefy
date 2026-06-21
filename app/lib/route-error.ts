import { isRouteErrorResponse } from "react-router";

export type AppErrorKind = "not-found" | "forbidden" | "server" | "network" | "unknown";

export interface AppErrorDetails {
  kind: AppErrorKind;
  status: number;
  title: string;
  message: string;
  showRetry: boolean;
}

function detailsFromStatus(status: number, statusText?: string, data?: unknown): AppErrorDetails {
  if (status === 404) {
    return {
      kind: "not-found",
      status: 404,
      title: "Page not found",
      message: "This page doesn't exist or may have been moved.",
      showRetry: false,
    };
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      status: 403,
      title: "Access denied",
      message: statusText || "You don't have permission to view this page.",
      showRetry: false,
    };
  }

  if (status >= 500) {
    const dataMessage = typeof data === "string" && data.trim() ? data.trim() : "";
    return {
      kind: "server",
      status,
      title: "Server error",
      message:
        dataMessage ||
        statusText ||
        "Something went wrong on our side. Please try again in a moment.",
      showRetry: true,
    };
  }

  return {
    kind: "unknown",
    status,
    title: "Request failed",
    message: statusText || "The request could not be completed.",
    showRetry: true,
  };
}

function isNetworkErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("network") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("load failed") ||
    normalized.includes("networkerror") ||
    normalized.includes("connection") ||
    normalized.includes("timeout")
  );
}

/** Normalize React Router / fetch / thrown Response errors for UI. */
export function getAppErrorDetails(error: unknown): AppErrorDetails {
  if (isRouteErrorResponse(error)) {
    return detailsFromStatus(error.status, error.statusText, error.data);
  }

  if (error instanceof Response) {
    return detailsFromStatus(error.status, error.statusText);
  }

  if (error instanceof TypeError && isNetworkErrorMessage(error.message)) {
    return {
      kind: "network",
      status: 0,
      title: "Network error",
      message: "We couldn't reach the server. Check your internet connection and try again.",
      showRetry: true,
    };
  }

  if (error instanceof Error) {
    if (isNetworkErrorMessage(error.message)) {
      return {
        kind: "network",
        status: 0,
        title: "Network error",
        message: "We couldn't reach the server. Check your internet connection and try again.",
        showRetry: true,
      };
    }

    return {
      kind: "unknown",
      status: 500,
      title: "Something went wrong",
      message: error.message || "An unexpected error occurred.",
      showRetry: true,
    };
  }

  return {
    kind: "unknown",
    status: 500,
    title: "Something went wrong",
    message: "An unexpected error occurred. Please try again.",
    showRetry: true,
  };
}

/** Shopify OAuth/session flows must still use the library error boundary. */
export function shouldUseShopifyBoundary(error: unknown): boolean {
  if (isRouteErrorResponse(error)) {
    return error.status === 401 || error.status === 302 || error.status === 301;
  }
  if (error instanceof Response) {
    return error.status === 401 || error.status === 302 || error.status === 301;
  }
  return false;
}
