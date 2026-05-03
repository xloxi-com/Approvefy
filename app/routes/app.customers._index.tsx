import { useEffect, useState, useCallback, useRef } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import {
  data,
  useLoaderData,
  useSubmit,
  useFetcher,
  useNavigate,
  Link,
  useRevalidator,
} from "react-router";
import {
  Page,
  Layout,
  Text,
  Card,
  Badge,
  BlockStack,
  TextField,
  EmptyState,
  Toast,
  IndexTable,
  useIndexResourceState,
  Tabs,
  Banner,
  Link as PolarisLink,
  Modal,
  Popover,
  Button,
  Checkbox,
  Box,
  DatePicker,
  ChoiceList,
  Pagination,
  Select,
  InlineStack,
  Icon,
  Spinner,
} from "@shopify/polaris";
import {
  LayoutColumns2Icon,
  EditIcon,
  DeleteIcon,
  CheckIcon,
  SearchIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import {
  getCustomers,
  getAnalytics,
  getApprovedTags,
  approveCustomer,
  denyCustomer,
  deleteCustomer,
  getCustomerEmailForRejection,
  getCustomerFirstNameForEmail,
  getCustomerApprovalModeForShop,
  getOfflineAccessTokenForShop,
  reconcilePendingRegistrationsForAutoApprovalShop,
  shouldRunAutoApprovalListReconcile,
} from "../models/approval.server";
import { getCustomDataLabelsForShopWithAdmin } from "../lib/form-config-labels.server";
import { getShopNameAndEmail } from "../lib/shop-meta.server";
import { sendRejectionEmail } from "../lib/rejection-email.server";
import { sendApprovalEmail } from "../lib/approval-email.server";
import { AnalyticsHeader } from "../components/AnalyticsHeader";
import { formatNoteForDisplay } from "../lib/format-note";

interface Customer {
  registrationId: string;
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  phone: string | null;
  tags: string[];
  createdAt: string;
}

type CustomerDeleteMode = "shopify" | "app" | "both";

function deleteModeConfirmSummary(mode: CustomerDeleteMode, count: number): string {
  const who = count === 1 ? "this customer" : `${count} selected customers`;
  switch (mode) {
    case "shopify":
      return `Remove ${who} from Shopify only. App records will remain.`;
    case "app":
      return `Remove ${who} from the app database only. Shopify customers will remain.`;
    case "both":
      return `Permanently remove ${who} from Shopify and the app. This cannot be undone.`;
    default:
      return "";
  }
}

const COLUMN_KEYS = ["name", "email", "company", "phone", "status", "dateJoin", "action"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Customer name",
  email: "Email",
  company: "Company",
  phone: "Phone",
  status: "Status",
  dateJoin: "Date Join",
  action: "Action",
};
const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  name: true,
  email: true,
  company: true,
  phone: true,
  status: true,
  dateJoin: true,
  action: true,
};
const DEFAULT_COLUMN_ORDER: ColumnKey[] = [...COLUMN_KEYS];
const STORAGE_KEY = "b2b-customer-approvals-columns";

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function normalizeColumnOrder(raw: unknown): ColumnKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_COLUMN_ORDER];
  const unique: ColumnKey[] = [];
  const seen = new Set<ColumnKey>();
  for (const item of raw) {
    const key = String(item) as ColumnKey;
    if ((COLUMN_KEYS as readonly string[]).includes(key) && !seen.has(key)) {
      unique.push(key);
      seen.add(key);
    }
  }
  for (const key of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(key)) unique.push(key);
  }
  return unique;
}

function loadColumnPrefs(): { visible: Record<ColumnKey, boolean>; order: ColumnKey[] } {
  if (typeof window === "undefined") return { visible: { ...DEFAULT_COLUMNS }, order: [...DEFAULT_COLUMN_ORDER] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;

        // New format: { visible: {...}, order: [...] }
        if (obj.visible && typeof obj.visible === "object" && !Array.isArray(obj.visible)) {
          const rawVisible = obj.visible as Record<string, unknown>;
          if ("edit" in rawVisible && !("action" in rawVisible)) {
            rawVisible.action = rawVisible.edit;
          }
          const visible: Record<ColumnKey, boolean> = { ...DEFAULT_COLUMNS };
          for (const key of COLUMN_KEYS) {
            if (typeof rawVisible[key] === "boolean") {
              visible[key] = rawVisible[key] as boolean;
            }
          }
          const order = normalizeColumnOrder(obj.order);
          return { visible, order };
        }

        // Legacy format: { name: true, email: true, ... }
        const legacy = obj as Record<string, unknown>;
        if ("edit" in legacy && !("action" in legacy)) {
          legacy.action = legacy.edit;
        }
        const visible: Record<ColumnKey, boolean> = { ...DEFAULT_COLUMNS };
        for (const key of COLUMN_KEYS) {
          if (typeof legacy[key] === "boolean") {
            visible[key] = legacy[key] as boolean;
          }
        }
        return { visible, order: [...DEFAULT_COLUMN_ORDER] };
      }
    }
  } catch {
    /* ignore */
  }
  return { visible: { ...DEFAULT_COLUMNS }, order: [...DEFAULT_COLUMN_ORDER] };
}

function saveColumnPrefs(visible: Record<ColumnKey, boolean>, order: ColumnKey[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visible,
        order,
      })
    );
  } catch {
    /* ignore */
  }
}

const PAGE_SIZE_OPTIONS = ["25", "50", "100", "200", "all"] as const;
const ALL_LIMIT = 10000;

function parseLimitParam(value: string | null): { limitParam: string; pageSize: number } {
  const allowed = new Set(PAGE_SIZE_OPTIONS);
  const param = (value || "").toLowerCase().trim();
  const limitParam = allowed.has(param as (typeof PAGE_SIZE_OPTIONS)[number]) ? param : "25";
  const pageSize = limitParam === "all" ? ALL_LIMIT : parseInt(limitParam, 10);
  return { limitParam: limitParam === "all" ? "all" : limitParam, pageSize };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const status = url.searchParams.get("status") || "all";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const { limitParam, pageSize } = parseLimitParam(url.searchParams.get("limit"));

  const loadParams = [shop, query, status, from || null, to || null, pageSize, page] as const;

  // Wall-clock for the awaited DB fan-out — emitted as `Server-Timing: db;dur=…` so we
  // can spot regressions (slow Supabase pool, missing index) directly from DevTools.
  const t0 = performance.now();
  const [initialCustomersData, initialAnalytics, approvalMode] = await Promise.all([
    getCustomers(...loadParams),
    getAnalytics(shop),
    getCustomerApprovalModeForShop(shop),
  ]);
  let dbMs = Math.round(performance.now() - t0);
  let customersData = initialCustomersData;
  let analytics = initialAnalytics;

  // Auto-approval: reconcile stuck "pending" rows against Shopify — throttled so every navigation
  // / revalidate does not fire dozens of Admin API calls (add ?sync=1 to force once).
  const secPurpose = request.headers.get("Sec-Fetch-Purpose");
  const isPrefetch =
    secPurpose === "prefetch" || request.headers.get("Purpose") === "prefetch";
  const forceShopifySync = url.searchParams.get("sync") === "1";
  const canReconcileListNow =
    page === 1 &&
    (status === "all" || status === "pending") &&
    !query.trim() &&
    !from &&
    !to;

  if (
    !isPrefetch &&
    canReconcileListNow &&
    approvalMode === "auto" &&
    (analytics.pending > 0 || customersData.customers.some((c) => c.tags.includes("status:pending")))
  ) {
    const shopAccessToken =
      (typeof session.accessToken === "string" && session.accessToken.trim()) ||
      (await getOfflineAccessTokenForShop(shop)) ||
      "";
    if (
      shopAccessToken &&
      shouldRunAutoApprovalListReconcile(shop, { force: forceShopifySync })
    ) {
      const repaired = await reconcilePendingRegistrationsForAutoApprovalShop(
        admin,
        shop,
        shopAccessToken,
        8
      );
      if (repaired) {
        const t1 = performance.now();
        [customersData, analytics] = await Promise.all([getCustomers(...loadParams), getAnalytics(shop)]);
        dbMs += Math.round(performance.now() - t1);
      }
    }
  }

  return data(
    {
      customers: customersData.customers,
      error: customersData.error,
      analytics,
      query,
      status,
      from,
      to,
      page,
      pageSize,
      limitParam,
      totalCount: customersData.totalCount,
    },
    { headers: { "Server-Timing": `db;dur=${dbMs}` } }
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const customerIds = (
    formData.getAll("customerIds[]").length > 0
      ? formData.getAll("customerIds[]")
      : formData.getAll("customerIds")
  ) as string[];

  if (!customerIds.length) {
    return {
      success: false,
      error: "No customers selected. Please select one or more customers from the list.",
      count: 0,
      actionType,
      activationUrl: null,
    };
  }

  let successCount = 0;
  let lastActivationUrl: string | null = null;
  const errors: string[] = [];

  let shopName = "Store";
  let shopEmail = "";
  if (actionType === "DENY" || actionType === "APPROVE") {
    const meta = await getShopNameAndEmail(admin, session.shop);
    shopName = meta.shopName;
    shopEmail = meta.shopEmail;
  }

  let approvedTags: string[] = [];
  let customDataLabels: Record<string, string> = {};
  if (actionType === "APPROVE") {
    [approvedTags, customDataLabels] = await Promise.all([
      getApprovedTags(session.shop),
      getCustomDataLabelsForShopWithAdmin(session.shop, admin),
    ]);
  }

  for (const id of customerIds) {
    try {
      if (actionType === "APPROVE") {
        const { activationUrl } = await approveCustomer(admin, id, session.shop, session.accessToken ?? "", {
          approvedTags,
          customDataLabels,
        });
        if (activationUrl) lastActivationUrl = activationUrl;
        // Email is non-blocking: DB + Shopify state is committed; merchant should not
        // wait on SMTP RTT (often 1–3s) before the toast renders. Errors are logged
        // and reported via a .catch handler so the promise never goes "unhandled".
        const shopForEmail = session.shop;
        getCustomerEmailForRejection(admin, shopForEmail, id)
          .then(async (toEmail) => {
            if (!toEmail) return;
            const customerFirstName =
              (await getCustomerFirstNameForEmail(admin, shopForEmail, id)) ?? undefined;
            return sendApprovalEmail(shopForEmail, toEmail, {
              shopName,
              shopEmail,
              customerFirstName,
              activationUrl: activationUrl ?? undefined,
            });
          })
          .catch((err) => console.error("[Approve] Email send failed:", err));
      } else if (actionType === "DENY") {
        await denyCustomer(admin, id);
        const shopForEmail = session.shop;
        getCustomerEmailForRejection(admin, shopForEmail, id)
          .then((toEmail) => {
            if (!toEmail) return;
            return sendRejectionEmail(shopForEmail, toEmail, { shopName, shopEmail });
          })
          .catch((err) => console.error("[Deny] Email send failed:", err));
      } else if (actionType === "DELETE") {
        const deleteMode = (formData.get("deleteMode") as "shopify" | "app" | "both") || "both";
        await deleteCustomer(admin, id, deleteMode);
      }
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error processing customer ${id}:`, error);
      errors.push(message);
    }
  }

  const firstError = errors.length > 0 ? errors[0] : null;
  return {
    success: errors.length === 0,
    error: firstError ?? null,
    count: successCount,
    actionType,
    activationUrl: lastActivationUrl,
  };
};

export default function Index() {
  const {
    customers,
    error,
    analytics,
    query: initialQuery,
    status: initialStatus,
    from: initialFrom,
    to: initialTo,
    page: initialPage,
    pageSize,
    limitParam: initialLimitParam,
    totalCount,
  } = useLoaderData<typeof loader>();
  /** Document navigation would set parent `navigation.state` to submitting/loading and show a full-page spinner in `app.tsx`. Fetcher submissions revalidate the route without that global overlay. */
  const mutationFetcher = useFetcher<typeof action>();
  const actionData = mutationFetcher.data;
  const submit = useSubmit();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const mutationInFlight =
    mutationFetcher.state === "submitting" ||
    (mutationFetcher.state === "loading" && mutationFetcher.formMethod === "POST");

  const [searchValue, setSearchValue] = useState(initialQuery);
  const [selectedTab, setSelectedTab] = useState(() => {
    switch (initialStatus) {
      case "pending": return 1;
      case "approved": return 2;
      case "denied": return 3;
      default: return 0;
    }
  });
  const [showToast, setShowToast] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(DEFAULT_COLUMNS);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [editColumnsOpen, setEditColumnsOpen] = useState(false);
  const [draggingColumn, setDraggingColumn] = useState<ColumnKey | null>(null);
  const [fromDate, setFromDate] = useState(initialFrom || "");
  const [toDate, setToDate] = useState(initialTo || "");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => {
    const base = initialFrom || initialTo;
    if (base) {
      const d = new Date(base);
      if (!Number.isNaN(d.getTime())) return d.getMonth();
    }
    return new Date().getMonth();
  });
  const [datePickerYear, setDatePickerYear] = useState(() => {
    const base = initialFrom || initialTo;
    if (base) {
      const d = new Date(base);
      if (!Number.isNaN(d.getTime())) return d.getFullYear();
    }
    return new Date().getFullYear();
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState<"current" | "all" | "selected">("all");
  const [singleDeleteCustomerId, setSingleDeleteCustomerId] = useState<string | null>(null);
  const [bulkDeleteStep, setBulkDeleteStep] = useState<"choose" | "confirm">("choose");
  const [bulkDeletePendingMode, setBulkDeletePendingMode] = useState<CustomerDeleteMode | null>(null);
  const [singleDeleteStep, setSingleDeleteStep] = useState<"choose" | "confirm">("choose");
  const [singleDeletePendingMode, setSingleDeletePendingMode] = useState<CustomerDeleteMode | null>(null);

  useEffect(() => {
    const prefs = loadColumnPrefs();
    setVisibleColumns(prefs.visible);
    setColumnOrder(prefs.order);
  }, []);
  const customerDetailFetcher = useFetcher<{
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    company?: string | null;
    status?: string;
    customData?: Record<string, unknown> | null;
    note?: string | null;
    createdAt?: string;
    reviewedAt?: string | null;
    reviewedBy?: string | null;
    error?: string;
  }>();

  useEffect(() => {
    if (!detailCustomerId) return;
    customerDetailFetcher.load(`/app/customer/${encodeURIComponent(detailCustomerId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when selected row changes; fetcher stable from useFetcher
  }, [detailCustomerId]);

  useEffect(() => {
    if (detailCustomerId && customerDetailFetcher.data?.error) {
      setDetailCustomerId(null);
    }
  }, [detailCustomerId, customerDetailFetcher.data?.error]);

  useEffect(() => {
    if (mutationFetcher.state !== "idle") return;
    const data = mutationFetcher.data;
    if (data?.success && (data.count ?? 0) > 0) {
      setShowToast(true);
    } else {
      setShowToast(false);
    }
  }, [mutationFetcher.state, mutationFetcher.data]);

  const resourceName = {
    singular: "customer",
    plural: "customers",
  };

  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(customers as unknown as { [key: string]: unknown }[]);

  const lastCustomerIdsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // Keep selection across polling/revalidation when the same rows are present.
    // Clear only when the underlying customer ids actually changed.
    const idsKey = (customers as Customer[]).map((c) => c.id).join("|");
    if (lastCustomerIdsKeyRef.current === null) {
      lastCustomerIdsKeyRef.current = idsKey;
      return;
    }
    if (lastCustomerIdsKeyRef.current !== idsKey) {
      clearSelection();
      lastCustomerIdsKeyRef.current = idsKey;
    }
  }, [customers, clearSelection]);

  const buildListFormData = useCallback(
    (overrides: { query?: string; status?: string; from?: string; to?: string; page?: number; limit?: string } = {}) => {
      const formData = new FormData();
      const tabs = ["all", "pending", "approved", "denied"];
      formData.set("query", overrides.query ?? searchValue);
      formData.set("status", overrides.status ?? tabs[selectedTab]);
      if (overrides.from !== undefined) formData.set("from", overrides.from);
      else if (fromDate) formData.set("from", fromDate);
      if (overrides.to !== undefined) formData.set("to", overrides.to);
      else if (toDate) formData.set("to", toDate);
      formData.set("page", String(overrides.page ?? initialPage));
      formData.set("limit", overrides.limit ?? initialLimitParam);
      return formData;
    },
    [searchValue, selectedTab, fromDate, toDate, initialPage, initialLimitParam]
  );

  const handleTabChange = useCallback(
    (selectedTabIndex: number) => {
      setSelectedTab(selectedTabIndex);
      const tabs = ["all", "pending", "approved", "denied"];
      const formData = buildListFormData({ status: tabs[selectedTabIndex], page: 1 });
      submit(formData, { method: "get", action: "/app/customers" });
    },
    [buildListFormData, submit]
  );

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        const formData = buildListFormData({ query: value, page: 1 });
        submit(formData, { method: "get", action: "/app/customers" });
      }, 300);
    },
    [buildListFormData, submit]
  );

  const handleDateChange = useCallback(
    (range: { start: Date; end: Date }) => {
      const startStr = range.start.toISOString().slice(0, 10);
      const endStr = range.end.toISOString().slice(0, 10);
      setFromDate(startStr);
      setToDate(endStr);
    },
    []
  );

  const handleMonthChange = useCallback((month: number, year: number) => {
    setDatePickerMonth(month);
    setDatePickerYear(year);
  }, []);

  const handleApplyFilters = useCallback(() => {
    const formData = buildListFormData({ page: 1 });
    submit(formData, { method: "get", action: "/app/customers" });
  }, [buildListFormData, submit]);

  const handleClearFilters = useCallback(() => {
    setFromDate("");
    setToDate("");
    const formData = buildListFormData({ from: "", to: "", page: 1 });
    submit(formData, { method: "get", action: "/app/customers" });
  }, [buildListFormData, submit]);

  const handlePaginationPrevious = useCallback(() => {
    if (initialPage <= 1) return;
    const formData = buildListFormData({ page: initialPage - 1 });
    submit(formData, { method: "get", action: "/app/customers" });
  }, [initialPage, buildListFormData, submit]);

  const handlePaginationNext = useCallback(() => {
    const nextStart = initialPage * pageSize + 1;
    if (totalCount < nextStart) return;
    const formData = buildListFormData({ page: initialPage + 1 });
    submit(formData, { method: "get", action: "/app/customers" });
  }, [initialPage, pageSize, totalCount, buildListFormData, submit]);

  const handlePageSizeChange = useCallback(
    (value: string) => {
      const formData = buildListFormData({ limit: value, page: 1 });
      submit(formData, { method: "get", action: "/app/customers" });
    },
    [buildListFormData, submit]
  );

  const handleExportCsv = useCallback(
    async (scope: "current" | "all" | "selected") => {
      const params = new URLSearchParams();
      if (searchValue) params.set("query", searchValue);
      const tabs = ["all", "pending", "approved", "denied"];
      params.set("status", tabs[selectedTab]);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (scope === "selected" && selectedResources.length > 0) {
        params.set("ids", selectedResources.join(","));
      } else if (scope === "current" && customers.length > 0) {
        const currentIds = (customers as Customer[]).map((c) => c.id);
        params.set("ids", currentIds.join(","));
      }
      const url = `/app/export-customers?${params.toString()}`;
      setExportLoading(true);
      setShowExportModal(false);
      try {
        const res = await fetch(url, { method: "GET", credentials: "include" });
        const contentType = res.headers.get("Content-Type") || "";
        if (!res.ok || !contentType.includes("text/csv")) {
          setExportLoading(false);
          return;
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        const match = disposition && /filename="?([^";\n]+)"?/.exec(disposition);
        const filename = match ? match[1].trim() : `customers-export-full-${new Date().toISOString().slice(0, 10)}.csv`;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      } finally {
        setExportLoading(false);
      }
    },
    [searchValue, selectedTab, fromDate, toDate, selectedResources, customers]
  );

  const handleExportModalExport = useCallback(() => {
    handleExportCsv(exportScope);
  }, [handleExportCsv, exportScope]);

  const toggleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveColumnPrefs(next, columnOrder);
      return next;
    });
  }, [columnOrder]);

  const moveColumn = useCallback((dragKey: ColumnKey, targetKey: ColumnKey) => {
    if (dragKey === targetKey) return;
    setColumnOrder((prev) => {
      const from = prev.indexOf(dragKey);
      const to = prev.indexOf(targetKey);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragKey);
      saveColumnPrefs(visibleColumns, next);
      return next;
    });
  }, [visibleColumns]);

  const handleResetColumnOrder = useCallback(() => {
    setColumnOrder([...DEFAULT_COLUMN_ORDER]);
    saveColumnPrefs(visibleColumns, [...DEFAULT_COLUMN_ORDER]);
  }, [visibleColumns]);

  const handleBulkAction = (actionType: "APPROVE" | "DENY" | "DELETE") => {
    if (actionType === "DELETE") {
      setBulkDeleteStep("choose");
      setBulkDeletePendingMode(null);
      setShowDeleteModal(true);
      return;
    }
    if (actionType === "DENY") {
      setShowDenyModal(true);
      return;
    }
    const formData = new FormData();
    formData.set("actionType", actionType);
    selectedResources.forEach((id: string) => {
      formData.append("customerIds[]", id);
    });
    mutationFetcher.submit(formData, { method: "post" });
  };

  const handleConfirmDeny = () => {
    setShowDenyModal(false);
    const formData = new FormData();
    formData.set("actionType", "DENY");
    selectedResources.forEach((id: string) => {
      formData.append("customerIds[]", id);
    });
    mutationFetcher.submit(formData, { method: "post" });
  };

  const handleConfirmDelete = (mode: CustomerDeleteMode) => {
    setShowDeleteModal(false);
    setBulkDeleteStep("choose");
    setBulkDeletePendingMode(null);
    const formData = new FormData();
    formData.set("actionType", "DELETE");
    formData.set("deleteMode", mode);
    selectedResources.forEach((id: string) => {
      formData.append("customerIds[]", id);
    });
    mutationFetcher.submit(formData, { method: "post" });
  };

  const handleSingleApprove = useCallback(
    (id: string) => {
      const formData = new FormData();
      formData.set("actionType", "APPROVE");
      formData.append("customerIds[]", id);
      mutationFetcher.submit(formData, { method: "post" });
    },
    [mutationFetcher]
  );

  const handleSingleDeleteConfirm = useCallback(
    (mode: CustomerDeleteMode) => {
      if (!singleDeleteCustomerId) return;
      setSingleDeleteCustomerId(null);
      setSingleDeleteStep("choose");
      setSingleDeletePendingMode(null);
      const formData = new FormData();
      formData.set("actionType", "DELETE");
      formData.set("deleteMode", mode);
      formData.append("customerIds[]", singleDeleteCustomerId);
      mutationFetcher.submit(formData, { method: "post" });
    },
    [singleDeleteCustomerId, mutationFetcher]
  );

  const denyMsg =
    actionData?.actionType === "DENY"
      ? `Successfully rejected ${actionData?.count ?? 0} customer(s).`
      : "";
  const activationUrl =
    actionData && "activationUrl" in actionData
      ? (actionData as { activationUrl?: string | null }).activationUrl
      : null;
  const toastMessage =
    actionData?.error
      ? actionData.error
      : actionData?.actionType === "APPROVE"
        ? activationUrl
          ? `Approved ${actionData?.count ?? 0} customer(s). They should open the customer login link from the approval email to access their Shopify customer account.`
          : `Approved ${actionData?.count ?? 0} customer(s).`
        : actionData?.actionType === "DELETE"
          ? `Successfully deleted ${actionData?.count ?? 0} customer(s).`
          : actionData?.actionType === "DENY"
            ? denyMsg
            : "";
  const toastMarkup = showToast ? (
    <Toast
      content={toastMessage}
      onDismiss={() => setShowToast(false)}
      error={!!actionData?.error}
    />
  ) : null;

  const allSelectedAreApproved =
    selectedResources.length > 0 &&
    selectedResources.every((id) => {
      const c = customers.find((cust: Customer) => cust.id === id);
      return c?.tags?.includes("status:approved") === true;
    });

  const promotedBulkActions = [
    {
      content: "Approve",
      onAction: () => handleBulkAction("APPROVE"),
    },
    {
      content: "Reject",
      onAction: () => handleBulkAction("DENY"),
      disabled: allSelectedAreApproved,
    },
    {
      content: "Delete customers",
      onAction: () => handleBulkAction("DELETE"),
    },
  ];

  const emptyStateMarkup = !customers.length ? (
    <EmptyState
      heading="No customers found"
      action={{ content: "Reset filters", onAction: () => handleTabChange(0) }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Try changing your search or filters.</p>
    </EmptyState>
  ) : null;

  const tabs = [
    {
      id: "all-customers",
      content: "All Customers",
      panelID: "all-customers-content",
    },
    {
      id: "pending-customers",
      content: "Pending",
      accessibilityLabel: "Pending customers",
      panelID: "pending-customers-content",
    },
    {
      id: "approved-customers",
      content: "Approved",
      panelID: "approved-customers-content",
    },
    {
      id: "denied-customers",
      content: "Rejected",
      panelID: "denied-customers-content",
    },
  ];

  return (
    <>
      <Modal
        open={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setBulkDeleteStep("choose");
          setBulkDeletePendingMode(null);
        }}
        title={bulkDeleteStep === "confirm" ? "Confirm delete" : "Delete customers"}
      >
        <Modal.Section>
          {bulkDeleteStep === "choose" ? (
            <BlockStack gap="400">
              <Text as="p">
                How do you want to delete {selectedResources.length} selected customer(s)?
              </Text>
              <BlockStack gap="300">
                <button
                  type="button"
                  onClick={() => {
                    setBulkDeletePendingMode("shopify");
                    setBulkDeleteStep("confirm");
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "#ffffff",
                    border: "1px solid #c9cccf",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                  }}
                >
                  <strong>Delete from Shopify only</strong>
                  <br />
                  <span style={{ color: "#6d7175", fontSize: "13px" }}>
                    Remove customer from Shopify backend. App records will remain.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkDeletePendingMode("app");
                    setBulkDeleteStep("confirm");
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "#ffffff",
                    border: "1px solid #c9cccf",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                  }}
                >
                  <strong>Delete from App server only</strong>
                  <br />
                  <span style={{ color: "#6d7175", fontSize: "13px" }}>
                    Remove from app database. Shopify customer will remain.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkDeletePendingMode("both");
                    setBulkDeleteStep("confirm");
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "#fee2e2",
                    border: "1px solid #ef4444",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                    color: "#991b1b",
                  }}
                >
                  <strong>Delete from Both</strong>
                  <br />
                  <span style={{ fontSize: "13px" }}>
                    Remove customer from Shopify and app database. This cannot be undone.
                  </span>
                </button>
              </BlockStack>
              <div style={{ textAlign: "right", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setBulkDeleteStep("choose");
                    setBulkDeletePendingMode(null);
                  }}
                  style={{
                    padding: "8px 20px",
                    background: "#f1f1f1",
                    border: "1px solid #c9cccf",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Cancel
                </button>
              </div>
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              <Text as="p" fontWeight="semibold">
                Are you sure you want to delete {selectedResources.length} selected customer(s)?
              </Text>
              {bulkDeletePendingMode ? (
                <Text as="p" tone="subdued">
                  {deleteModeConfirmSummary(bulkDeletePendingMode, selectedResources.length)}
                </Text>
              ) : null}
              <InlineStack gap="300" align="end">
                <Button
                  onClick={() => {
                    setBulkDeleteStep("choose");
                    setBulkDeletePendingMode(null);
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  tone="critical"
                  disabled={!bulkDeletePendingMode}
                  onClick={() => {
                    if (bulkDeletePendingMode) handleConfirmDelete(bulkDeletePendingMode);
                  }}
                >
                  Confirm delete
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      <Modal
        open={singleDeleteCustomerId !== null}
        onClose={() => {
          setSingleDeleteCustomerId(null);
          setSingleDeleteStep("choose");
          setSingleDeletePendingMode(null);
        }}
        title={singleDeleteStep === "confirm" ? "Confirm delete" : "Delete this customer?"}
      >
        <Modal.Section>
          {singleDeleteStep === "choose" ? (
            <BlockStack gap="400">
              <Text as="p">How do you want to delete this customer?</Text>
              <BlockStack gap="300">
                <button
                  type="button"
                  onClick={() => {
                    setSingleDeletePendingMode("shopify");
                    setSingleDeleteStep("confirm");
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "#ffffff",
                    border: "1px solid #c9cccf",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                  }}
                >
                  <strong>Delete from Shopify only</strong>
                  <br />
                  <span style={{ color: "#6d7175", fontSize: "13px" }}>
                    Remove customer from Shopify backend. App records will remain.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSingleDeletePendingMode("app");
                    setSingleDeleteStep("confirm");
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "#ffffff",
                    border: "1px solid #c9cccf",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                  }}
                >
                  <strong>Delete from App server only</strong>
                  <br />
                  <span style={{ color: "#6d7175", fontSize: "13px" }}>
                    Remove from app database. Shopify customer will remain.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSingleDeletePendingMode("both");
                    setSingleDeleteStep("confirm");
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "#fee2e2",
                    border: "1px solid #ef4444",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                    color: "#991b1b",
                  }}
                >
                  <strong>Delete from Both</strong>
                  <br />
                  <span style={{ fontSize: "13px" }}>
                    Remove customer from Shopify and app database. This cannot be undone.
                  </span>
                </button>
              </BlockStack>
              <div style={{ textAlign: "right", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSingleDeleteCustomerId(null);
                    setSingleDeleteStep("choose");
                    setSingleDeletePendingMode(null);
                  }}
                  style={{
                    padding: "8px 20px",
                    background: "#f1f1f1",
                    border: "1px solid #c9cccf",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Cancel
                </button>
              </div>
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              <Text as="p" fontWeight="semibold">
                Are you sure you want to delete this customer?
              </Text>
              {singleDeletePendingMode ? (
                <Text as="p" tone="subdued">
                  {deleteModeConfirmSummary(singleDeletePendingMode, 1)}
                </Text>
              ) : null}
              <InlineStack gap="300" align="end">
                <Button
                  onClick={() => {
                    setSingleDeleteStep("choose");
                    setSingleDeletePendingMode(null);
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  tone="critical"
                  disabled={!singleDeletePendingMode}
                  onClick={() => {
                    if (singleDeletePendingMode) handleSingleDeleteConfirm(singleDeletePendingMode);
                  }}
                >
                  Confirm delete
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      <Modal
        open={showDenyModal}
        onClose={() => setShowDenyModal(false)}
        title="Reject customers?"
        primaryAction={{
          content: "Yes, Reject",
          destructive: true,
          onAction: handleConfirmDeny,
        }}
        secondaryActions={[
          {
            content: "No, Cancel",
            onAction: () => setShowDenyModal(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to reject {selectedResources.length} selected customer(s)?
            They will not be able to access the store.
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={detailCustomerId !== null}
        onClose={() => setDetailCustomerId(null)}
        title="Registration details"
        size="large"
      >
        <Modal.Section>
          {customerDetailFetcher.state === "loading" && (
            <Text as="p">Loading...</Text>
          )}
          {customerDetailFetcher.state !== "loading" && customerDetailFetcher.data?.error && (
            <Text as="p" tone="critical">{customerDetailFetcher.data.error}</Text>
          )}
          {customerDetailFetcher.state !== "loading" && customerDetailFetcher.data && !customerDetailFetcher.data.error && (
            <BlockStack gap="300">
              <Text as="p" fontWeight="bold">{customerDetailFetcher.data.firstName} {customerDetailFetcher.data.lastName}</Text>
              <div>
                <Text as="p" variant="bodySm" tone="subdued">Email</Text>
                <Text as="p">{customerDetailFetcher.data.email ?? "—"}</Text>
              </div>
              <div>
                <Text as="p" variant="bodySm" tone="subdued">Phone</Text>
                <Text as="p">{customerDetailFetcher.data.phone ?? "—"}</Text>
              </div>
              <div>
                <Text as="p" variant="bodySm" tone="subdued">Company</Text>
                <Text as="p">{customerDetailFetcher.data.company ?? "—"}</Text>
              </div>
              <div>
                <Text as="p" variant="bodySm" tone="subdued">Status</Text>
                <Text as="p">{customerDetailFetcher.data.status ?? "—"}</Text>
              </div>
              <div>
                <Text as="p" variant="bodySm" tone="subdued">Date joined</Text>
                <Text as="p">{customerDetailFetcher.data.createdAt ? new Date(customerDetailFetcher.data.createdAt).toLocaleString() : "—"}</Text>
              </div>
              {customerDetailFetcher.data.note && (
                <div>
                  <Text as="p" variant="bodySm" tone="subdued">Note</Text>
                  <Text as="p">
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "12em", overflow: "auto" }}>
                      {formatNoteForDisplay(customerDetailFetcher.data.note)}
                    </pre>
                  </Text>
                </div>
              )}
              {customerDetailFetcher.data.reviewedAt && (
                <div>
                  <Text as="p" variant="bodySm" tone="subdued">Reviewed at</Text>
                  <Text as="p">{new Date(customerDetailFetcher.data.reviewedAt).toLocaleString()}</Text>
                </div>
              )}
              {customerDetailFetcher.data.reviewedBy && (
                <div>
                  <Text as="p" variant="bodySm" tone="subdued">Reviewed by</Text>
                  <Text as="p">{customerDetailFetcher.data.reviewedBy}</Text>
                </div>
              )}
              {customerDetailFetcher.data.customData &&
                typeof customerDetailFetcher.data.customData === "object" &&
                Object.keys(customerDetailFetcher.data.customData as object).length > 0 && (
                  <div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Other form fields
                    </Text>
                    <BlockStack gap="200">
                      {Object.entries(
                        customerDetailFetcher.data.customData as Record<
                          string,
                          unknown
                        >
                      ).map(([key, value]) => {
                        const label =
                          (customerDetailFetcher.data as {
                            customDataLabels?: Record<string, string>;
                          }).customDataLabels?.[key] ??
                          key.replace(/_/g, " ");
                        const displayVal =
                          value == null || value === "" ? "—" : String(value);
                        return (
                          <div key={key}>
                            <Text
                              as="span"
                              variant="bodySm"
                              tone="subdued"
                            >{`${label}: `}</Text>
                            <Text as="span">{displayVal}</Text>
                          </div>
                        );
                      })}
                    </BlockStack>
                  </div>
                )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      <Modal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export customers"
        primaryAction={{
          content: "Export",
          onAction: handleExportModalExport,
          loading: exportLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowExportModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd" tone="subdued">
              Choose which customers to include in the CSV export.
            </Text>
            <ChoiceList
              title="Customers selected"
              choices={[
                { label: "Current page", value: "current" },
                { label: "All customers", value: "all" },
                {
                  label: `Selected: ${selectedResources.length} customer${selectedResources.length !== 1 ? "s" : ""}`,
                  value: "selected",
                  disabled: selectedResources.length === 0,
                },
              ]}
              selected={[exportScope]}
              onChange={(selected) => setExportScope((selected[0] as "current" | "all" | "selected") || "all")}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={dateFilterOpen}
        onClose={() => setDateFilterOpen(false)}
        title="Filter by date"
        primaryAction={{
          content: "Apply",
          onAction: () => {
            handleApplyFilters();
            setDateFilterOpen(false);
          },
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDateFilterOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <div className="app-modal-form-row">
              <div className="app-modal-form-field">
                <TextField
                  label="From"
                  value={formatDisplayDate(fromDate)}
                  autoComplete="off"
                  readOnly
                />
              </div>
              <div className="app-modal-form-field">
                <TextField
                  label="To"
                  value={formatDisplayDate(toDate)}
                  autoComplete="off"
                  readOnly
                />
              </div>
            </div>
            <DatePicker
              month={datePickerMonth}
              year={datePickerYear}
              onChange={handleDateChange}
              onMonthChange={handleMonthChange}
              selected={
                fromDate && toDate
                  ? {
                      start: new Date(fromDate),
                      end: new Date(toDate),
                    }
                  : undefined
              }
              allowRange
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}>
              <Button
                onClick={() => {
                  handleClearFilters();
                  setDateFilterOpen(false);
                }}
                variant="tertiary"
              >
                Clear filter
              </Button>
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Page title="Customers" fullWidth>
        <div className="app-nav-tabs-mobile" style={{ marginBottom: 12 }}>
        <BlockStack gap="200" inlineAlign="start">
          <InlineStack gap="100" wrap>
            <Button size="slim" onClick={() => navigate("/app")}>
              Approvefy
            </Button>
            <Button size="slim" variant="primary" onClick={() => navigate("/app/customers")}>
              Customers
            </Button>
            <Button size="slim" onClick={() => navigate("/app/form-config")}>
              Form Builder
            </Button>
            <Button size="slim" onClick={() => navigate("/app/settings")}>
              Settings
            </Button>
          </InlineStack>
        </BlockStack>
        </div>

        {toastMarkup}

        {actionData?.error && (
          <div style={{ marginBottom: "16px" }}>
            <Banner tone="critical" onDismiss={() => {}}>
              {actionData.error}
            </Banner>
          </div>
        )}

        {showToast && actionData?.actionType === "APPROVE" && activationUrl && (
          <div style={{ marginBottom: "16px" }}>
            <Banner tone="info" onDismiss={() => setShowToast(false)}>
              <p><strong>Customer login:</strong> Share this link with the approved customer so they can log in to their Shopify customer account. First visit may ask them to finish account activation. (Link expires in 30 days.)</p>
              <p style={{ wordBreak: "break-all", marginTop: "8px" }}>
                <PolarisLink url={activationUrl} external>
                  {activationUrl}
                </PolarisLink>
              </p>
            </Banner>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: "20px" }}>
            <Banner title="Error" tone="critical">
              <p>{error}</p>
            </Banner>
          </div>
        )}

        <BlockStack gap="500">
          <AnalyticsHeader
            total={analytics.total}
            pending={analytics.pending}
            denied={analytics.denied}
          />

          <Layout>
            <Layout.Section>
              <div className="app-backend-card">
              <Card padding="0">
                <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                  <div className="app-index-toolbar" style={{ padding: "16px" }}>
                    <div className="app-index-toolbar-search">
                      <TextField
                        label="Search customers"
                        value={searchValue}
                        onChange={handleSearchChange}
                        autoComplete="off"
                        placeholder="Search by name, email, company or phone"
                        prefix={<Icon source={SearchIcon} tone="subdued" />}
                        clearButton
                        onClearButtonClick={() => handleSearchChange("")}
                      />
                    </div>
                    <div className="app-index-toolbar-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      {mutationInFlight ? (
                        <InlineStack gap="200" blockAlign="center">
                          <Spinner size="small" />
                          <Text as="span" tone="subdued">
                            Updating customers…
                          </Text>
                        </InlineStack>
                      ) : null}
                      <Button
                        icon={RefreshIcon}
                        variant="secondary"
                        accessibilityLabel="Reload customers"
                        loading={revalidator.state === "loading"}
                        onClick={() => revalidator.revalidate()}
                        disabled={mutationInFlight}
                      />
                      <Button onClick={() => setDateFilterOpen(true)}>
                        {fromDate && toDate
                          ? `${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}`
                          : fromDate
                            ? `From ${formatDisplayDate(fromDate)}`
                            : toDate
                              ? `To ${formatDisplayDate(toDate)}`
                              : "Date filter"}
                      </Button>
                      <Button
                        onClick={() => {
                          setExportScope(selectedResources.length > 0 ? "selected" : "all");
                          setShowExportModal(true);
                        }}
                        loading={exportLoading}
                        variant="secondary"
                      >
                        Export CSV
                      </Button>
                    </div>
                    <Popover
                      active={editColumnsOpen}
                      autofocusTarget="first-node"
                      onClose={() => setEditColumnsOpen(false)}
                      activator={
                        <Button icon={LayoutColumns2Icon} onClick={() => setEditColumnsOpen(true)} accessibilityLabel="Edit columns">
                          Edit columns
                        </Button>
                      }
                    >
                      <Box padding="300" minWidth="220px">
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="p" variant="headingSm">Show columns</Text>
                            <Button size="slim" variant="plain" onClick={handleResetColumnOrder}>
                              Reset order
                            </Button>
                          </InlineStack>
                          {columnOrder.map((key) => (
                            <div
                              key={key}
                              draggable
                              onDragStart={() => setDraggingColumn(key)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (draggingColumn && draggingColumn !== key) {
                                  moveColumn(draggingColumn, key);
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (draggingColumn && draggingColumn !== key) {
                                  moveColumn(draggingColumn, key);
                                }
                                setDraggingColumn(null);
                              }}
                              onDragEnd={() => setDraggingColumn(null)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "4px 2px",
                                cursor: "grab",
                              }}
                            >
                              <span style={{ color: "#6d7175", userSelect: "none", fontSize: "14px", lineHeight: 1 }}>
                                ⋮⋮
                              </span>
                              <div style={{ flex: 1 }}>
                                <Checkbox
                                  label={COLUMN_LABELS[key]}
                                  checked={visibleColumns[key]}
                                  onChange={() => toggleColumn(key)}
                                />
                              </div>
                            </div>
                          ))}
                        </BlockStack>
                      </Box>
                    </Popover>
                  </div>
                  {(() => {
                    const orderedVisibleColumns = columnOrder.filter((k) => visibleColumns[k]);
                    const tableColumns = orderedVisibleColumns.length > 0 ? orderedVisibleColumns : ["name" as ColumnKey];
                    return (
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={customers.length}
                    selectedItemsCount={
                      allResourcesSelected ? "All" : selectedResources.length
                    }
                    onSelectionChange={handleSelectionChange}
                    promotedBulkActions={promotedBulkActions}
                    headings={(() => {
                      const list = tableColumns.map((k) => ({ title: COLUMN_LABELS[k] }));
                      const result = list.length > 0 ? list : [{ title: COLUMN_LABELS.name }];
                      return result as [{ title: string }, ...{ title: string }[]];
                    })()}
                    emptyState={emptyStateMarkup}
                  >
                    {customers.map((customer: Customer, index: number) => {
                      const { id, firstName, lastName, email, company, phone, tags, createdAt } = customer;
                      return (
                        <IndexTable.Row
                          id={id}
                          key={id}
                          selected={selectedResources.includes(id)}
                          position={index}
                          onClick={() => {}}
                        >
                          {tableColumns.map((columnKey) => {
                            if (columnKey === "name") {
                              return (
                                <IndexTable.Cell key={`${id}-name`}>
                                  <Link
                                    to={`/app/customer/${encodeURIComponent(id)}`}
                                    prefetch="intent"
                                    style={{
                                      color: "#303030",
                                      fontWeight: 600,
                                      textDecoration: "none",
                                    }}
                                    className="customer-name-link"
                                  >
                                    {firstName} {lastName}
                                  </Link>
                                </IndexTable.Cell>
                              );
                            }
                            if (columnKey === "email") return <IndexTable.Cell key={`${id}-email`}>{email}</IndexTable.Cell>;
                            if (columnKey === "company") return <IndexTable.Cell key={`${id}-company`}>{company ?? "—"}</IndexTable.Cell>;
                            if (columnKey === "phone") return <IndexTable.Cell key={`${id}-phone`}>{phone ?? "—"}</IndexTable.Cell>;
                            if (columnKey === "status") {
                              return (
                                <IndexTable.Cell key={`${id}-status`}>
                                  <Badge tone={tags.includes("status:approved") ? "success" : tags.includes("status:denied") ? "critical" : "attention"}>
                                    {tags.includes("status:approved") ? "Approved" : tags.includes("status:denied") ? "Rejected" : "Pending"}
                                  </Badge>
                                </IndexTable.Cell>
                              );
                            }
                            if (columnKey === "dateJoin") {
                              return <IndexTable.Cell key={`${id}-dateJoin`}>{formatDisplayDate(createdAt)}</IndexTable.Cell>;
                            }
                            if (columnKey === "action") {
                              return (
                                <IndexTable.Cell key={`${id}-action`}>
                                  <div
                                    style={{ display: "flex", alignItems: "center", gap: "12px" }}
                                    onClick={(e) => e.stopPropagation()}
                                    role="presentation"
                                  >
                                    <Button
                                      variant="tertiary"
                                      size="slim"
                                      icon={EditIcon}
                                      accessibilityLabel="Edit customer"
                                      onClick={() => navigate(`/app/customer/${encodeURIComponent(id)}`)}
                                    />
                                    <Button
                                      variant="tertiary"
                                      size="slim"
                                      icon={DeleteIcon}
                                      accessibilityLabel="Delete customer"
                                      onClick={() => setSingleDeleteCustomerId(id)}
                                    />
                                    {!tags.includes("status:approved") && (
                                      <Button
                                        variant="tertiary"
                                        size="slim"
                                        icon={CheckIcon}
                                        accessibilityLabel="Approve"
                                        onClick={() => handleSingleApprove(id)}
                                      />
                                    )}
                                  </div>
                                </IndexTable.Cell>
                              );
                            }
                            return null;
                          })}
                        </IndexTable.Row>
                      );
                    })}
                  </IndexTable>
                    );
                  })()}
                  {totalCount > 0 && (
                    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--p-color-border-secondary)" }}>
                      <InlineStack gap="400" blockAlign="center" align="space-between" wrap={false}>
                        <InlineStack gap="300" blockAlign="center">
                          <Select
                            label="Per page"
                            labelInline
                            options={[
                              { label: "25", value: "25" },
                              { label: "50", value: "50" },
                              { label: "100", value: "100" },
                              { label: "200", value: "200" },
                              { label: "All", value: "all" },
                            ]}
                            value={initialLimitParam}
                            onChange={handlePageSizeChange}
                          />
                        </InlineStack>
                        <Pagination
                          hasPrevious={initialPage > 1}
                          onPrevious={handlePaginationPrevious}
                          hasNext={(initialPage * pageSize) < totalCount}
                          onNext={handlePaginationNext}
                          label={
                            totalCount === 0
                              ? "0 of 0"
                              : `${(initialPage - 1) * pageSize + 1}-${Math.min(initialPage * pageSize, totalCount)} of ${totalCount}`
                          }
                        />
                      </InlineStack>
                    </div>
                  )}
                </Tabs>
              </Card>
              </div>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
    </>
  );
}
