import { useEffect, useState, useCallback, useRef } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useSubmit,
  useFetcher,
  useNavigate,
  useRevalidator,
  Link,
} from "react-router";
import {
  Page,
  Layout,
  Text,
  LegacyCard,
  Badge,
  BlockStack,
  TextField,
  EmptyState,
  Toast,
  Frame,
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
} from "@shopify/polaris";
import { LayoutColumns2Icon, EditIcon, DeleteIcon, CheckIcon, SearchIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getCustomers, getApprovedTags, approveCustomer, denyCustomer, deleteCustomer, getCustomerEmailForRejection, getCustomerFirstNameForEmail } from "../models/approval.server";
import { getCustomDataLabelsForShopWithAdmin } from "../lib/form-config-labels.server";
import { getShopDisplayName, parseShopFromGraphqlResponse } from "../lib/liquid-placeholders";
import { sendRejectionEmail } from "../lib/rejection-email.server";
import { sendApprovalEmail } from "../lib/approval-email.server";
import { AnalyticsHeader } from "../components/AnalyticsHeader";
import { formatNoteForDisplay } from "../lib/format-note";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  phone: string | null;
  tags: string[];
  createdAt: string;
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

function loadColumnPrefs(): Record<ColumnKey, boolean> {
  if (typeof window === "undefined") return { ...DEFAULT_COLUMNS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if ("edit" in parsed && !("action" in parsed)) {
        parsed.action = parsed.edit;
      }
      return { ...DEFAULT_COLUMNS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_COLUMNS }
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
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const status = url.searchParams.get("status") || "all";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const { limitParam, pageSize } = parseLimitParam(url.searchParams.get("limit"));

  const customersData = await getCustomers(
    shop,
    query,
    status,
    from || null,
    to || null,
    pageSize,
    page
  );

  return {
    customers: customersData.customers,
    error: customersData.error,
    analytics: {
      total: 0,
      pending: 0,
      denied: 0,
    },
    query,
    status,
    from,
    to,
    page,
    pageSize,
    limitParam,
    totalCount: customersData.totalCount,
  };
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
    try {
      const shopRes = await admin.graphql(`#graphql query { shop { name contactEmail } }`);
      const parsed = await parseShopFromGraphqlResponse(shopRes);
      shopName = parsed.shopName;
      shopEmail = parsed.shopEmail;
    } catch { /* use defaults */ }
    shopName = getShopDisplayName(session.shop, shopName);
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
        const toEmail = await getCustomerEmailForRejection(admin, session.shop, id);
        if (toEmail) {
          await sendApprovalEmail(session.shop, toEmail, {
            shopName,
            shopEmail,
            customerFirstName: (await getCustomerFirstNameForEmail(admin, session.shop, id)) ?? undefined,
            activationUrl: activationUrl ?? undefined,
          });
        }
      } else if (actionType === "DENY") {
        await denyCustomer(admin, id);
        const toEmail = await getCustomerEmailForRejection(admin, session.shop, id);
        if (toEmail) {
          await sendRejectionEmail(session.shop, toEmail, { shopName, shopEmail });
        }
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
    analytics: initialAnalytics,
    query: initialQuery,
    status: initialStatus,
    from: initialFrom,
    to: initialTo,
    page: initialPage,
    pageSize,
    limitParam: initialLimitParam,
    totalCount,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

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
  const [editColumnsOpen, setEditColumnsOpen] = useState(false);
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
  const [analytics, setAnalytics] = useState(initialAnalytics);

  const analyticsFetcher = useFetcher<{
    total?: number;
    pending?: number;
    denied?: number;
    error?: string;
  }>();

  useEffect(() => {
    if (analyticsFetcher.state === "idle" && !analyticsFetcher.data) {
      analyticsFetcher.load("/app/api/analytics");
    }
  }, [analyticsFetcher]);

  useEffect(() => {
    if (analyticsFetcher.data && !analyticsFetcher.data.error) {
      setAnalytics({
        total: analyticsFetcher.data.total ?? 0,
        pending: analyticsFetcher.data.pending ?? 0,
        denied: analyticsFetcher.data.denied ?? 0,
      });
    }
  }, [analyticsFetcher.data]);

  // Periodically revalidate loader data so new registrations from the storefront
  // show up in this list without requiring a manual refresh.
  // Only poll while the tab is visible, and use a slightly longer interval to
  // reduce backend/database load.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId != null) return;
      intervalId = setInterval(() => {
        revalidator.revalidate();
      }, 15000);
    };

    const stop = () => {
      if (intervalId == null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
      if (document.visibilityState === "visible") {
        start();
      }
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      stop();
    };
  }, [revalidator]);

  useEffect(() => {
    setVisibleColumns(loadColumnPrefs());
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
    if (detailCustomerId) {
      customerDetailFetcher.load(`/app/customer/${encodeURIComponent(detailCustomerId)}`);
    }
  }, [detailCustomerId, customerDetailFetcher]);

  useEffect(() => {
    if (detailCustomerId && customerDetailFetcher.data?.error) {
      setDetailCustomerId(null);
    }
  }, [detailCustomerId, customerDetailFetcher.data?.error]);

  useEffect(() => {
    if (actionData?.success && (actionData.count ?? 0) > 0) {
      setShowToast(true);
    } else {
      setShowToast(false);
    }
  }, [actionData]);

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

  useEffect(() => {
    // When the customer list changes (e.g. after delete or new load), clear any old row selection
    clearSelection();
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
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const handleBulkAction = (actionType: "APPROVE" | "DENY" | "DELETE") => {
    if (actionType === "DELETE") {
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
    submit(formData, { method: "post" });
  };

  const handleConfirmDeny = () => {
    setShowDenyModal(false);
    const formData = new FormData();
    formData.set("actionType", "DENY");
    selectedResources.forEach((id: string) => {
      formData.append("customerIds[]", id);
    });
    submit(formData, { method: "post" });
  };

  const handleConfirmDelete = (mode: "shopify" | "app" | "both") => {
    setShowDeleteModal(false);
    const formData = new FormData();
    formData.set("actionType", "DELETE");
    formData.set("deleteMode", mode);
    selectedResources.forEach((id: string) => {
      formData.append("customerIds[]", id);
    });
    submit(formData, { method: "post" });
  };

  const handleSingleApprove = useCallback(
    (id: string) => {
      const formData = new FormData();
      formData.set("actionType", "APPROVE");
      formData.append("customerIds[]", id);
      submit(formData, { method: "post" });
    },
    [submit]
  );

  const handleSingleDeleteConfirm = useCallback(
    (mode: "shopify" | "app" | "both") => {
      if (!singleDeleteCustomerId) return;
      setSingleDeleteCustomerId(null);
      const formData = new FormData();
      formData.set("actionType", "DELETE");
      formData.set("deleteMode", mode);
      formData.append("customerIds[]", singleDeleteCustomerId);
      submit(formData, { method: "post" });
    },
    [singleDeleteCustomerId, submit]
  );

  const denyMsg =
    actionData?.actionType === "DENY"
      ? `Successfully rejected ${actionData?.count ?? 0} customer(s).`
      : "";
  const toastMessage =
    actionData?.error
      ? actionData.error
      : actionData?.actionType === "APPROVE"
        ? `Approved ${actionData?.count ?? 0} customer(s). They must open the activation link to set their password, then they can log in.`
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

  const activationUrl = actionData && "activationUrl" in actionData ? (actionData as { activationUrl?: string | null }).activationUrl : null;

  return (
    <Frame>
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete customers"
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">
              How do you want to delete {selectedResources.length} selected customer(s)?
            </Text>
            <BlockStack gap="300">
              <button
                type="button"
                onClick={() => handleConfirmDelete("shopify")}
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
                onClick={() => handleConfirmDelete("app")}
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
                onClick={() => handleConfirmDelete("both")}
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
                onClick={() => setShowDeleteModal(false)}
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
        </Modal.Section>
      </Modal>

      <Modal
        open={singleDeleteCustomerId !== null}
        onClose={() => setSingleDeleteCustomerId(null)}
        title="Delete this customer?"
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">How do you want to delete this customer?</Text>
            <BlockStack gap="300">
              <button
                type="button"
                onClick={() => handleSingleDeleteConfirm("shopify")}
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
                onClick={() => handleSingleDeleteConfirm("app")}
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
                onClick={() => handleSingleDeleteConfirm("both")}
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
                onClick={() => setSingleDeleteCustomerId(null)}
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
              <p><strong>Customer login:</strong> Send this link to the approved customer so they can set their password and log in. (Link expires in 30 days.)</p>
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
              <LegacyCard>
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
                    <div className="app-index-toolbar-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                          <Text as="p" variant="headingSm">Show columns</Text>
                          {COLUMN_KEYS.map((key) => (
                            <Checkbox
                              key={key}
                              label={COLUMN_LABELS[key]}
                              checked={visibleColumns[key]}
                              onChange={() => toggleColumn(key)}
                            />
                          ))}
                        </BlockStack>
                      </Box>
                    </Popover>
                  </div>
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={customers.length}
                    selectedItemsCount={
                      allResourcesSelected ? "All" : selectedResources.length
                    }
                    onSelectionChange={handleSelectionChange}
                    promotedBulkActions={promotedBulkActions}
                    headings={(() => {
                      const list = COLUMN_KEYS.filter((k) => visibleColumns[k]).map((k) => ({ title: COLUMN_LABELS[k] }));
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
                          {visibleColumns.name && (
                            <IndexTable.Cell>
                              <Link
                                to={`/app/customer/${encodeURIComponent(id)}`}
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
                          )}
                          {visibleColumns.email && <IndexTable.Cell>{email}</IndexTable.Cell>}
                          {visibleColumns.company && <IndexTable.Cell>{company ?? "—"}</IndexTable.Cell>}
                          {visibleColumns.phone && <IndexTable.Cell>{phone ?? "—"}</IndexTable.Cell>}
                          {visibleColumns.status && (
                            <IndexTable.Cell>
                              <Badge tone={tags.includes("status:approved") ? "success" : tags.includes("status:denied") ? "critical" : "attention"}>
                                {tags.includes("status:approved") ? "Approved" : tags.includes("status:denied") ? "Rejected" : "Pending"}
                              </Badge>
                            </IndexTable.Cell>
                          )}
                          {visibleColumns.dateJoin && (
                            <IndexTable.Cell>{formatDisplayDate(createdAt)}</IndexTable.Cell>
                          )}
                          {visibleColumns.action && (
                            <IndexTable.Cell>
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
                          )}
                        </IndexTable.Row>
                      );
                    })}
                  </IndexTable>
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
              </LegacyCard>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
    </Frame>
  );
}
