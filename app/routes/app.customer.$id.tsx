import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useNavigation, useNavigate, Form, useFetcher, redirect } from "react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Page, LegacyCard, BlockStack, InlineStack, Text, TextField, Select, Button, Banner, Thumbnail, Box, ButtonGroup, Modal } from "@shopify/polaris";
import { FileIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getRegistrationDetails, updateRegistrationDetails, approveCustomer, updateShopifyCustomer, deleteCustomer } from "../models/approval.server";
import { getShopDisplayName, parseShopFromGraphqlResponse } from "../lib/liquid-placeholders";
import { sendRejectionEmail } from "../lib/rejection-email.server";
import { sendApprovalEmail } from "../lib/approval-email.server";
import { getCustomDataLabelsForShopWithAdmin } from "../lib/form-config-labels.server";

type RegistrationLite = NonNullable<
  Awaited<ReturnType<typeof getRegistrationDetails>>
>;

type LoaderData =
  | { error: string }
  | (RegistrationLite & {
      id: string;
      createdAt: string;
      reviewedAt: string | null;
      customDataLabels: Record<string, string>;
    });

type ActionJson = { success: boolean; error?: string; resendRejection?: boolean; resendApproval?: boolean };
function isActionJson(
  data: unknown
): data is ActionJson {
  return typeof data === "object" && data !== null && !(data instanceof Response);
}

function normalizeCustomDataValueForText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          const primitives = (parsed as unknown[]).filter(
            (item) =>
              item !== null &&
              (typeof item === "string" ||
                typeof item === "number" ||
                typeof item === "boolean")
          );
          if (primitives.length > 0 && primitives.length === (parsed as unknown[]).length) {
            return primitives.map((item) => String(item)).join("\n");
          }
        }
      } catch {
        // not JSON or not an array of primitives – fall through to raw string
      }
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  const rawId = params.id;
  if (!rawId || !shop) {
    return { error: "Missing id or shop" };
  }
  const id = decodeURIComponent(rawId);

  try {
    // Load registration details and custom data labels in parallel (single auth, no duplicate calls)
    const [details, customDataLabels] = await Promise.all([
      getRegistrationDetails(id, shop),
      getCustomDataLabelsForShopWithAdmin(shop, admin),
    ]);
    if (!details) {
      return { error: "Customer not found" };
    }

    return {
      id: params.id ?? "",
      ...details,
      createdAt: details.createdAt.toISOString(),
      reviewedAt: details.reviewedAt?.toISOString() ?? null,
      customDataLabels,
    };
  } catch (error) {
    console.error("Error loading customer details", error);
    return { error: "Failed to load customer details. Please try again later." };
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  const rawId = params.id;
  if (!rawId || !shop) {
    return { success: false, error: "Missing id or shop" };
  }
  const id = decodeURIComponent(rawId);
  if (request.method !== "POST") return { success: false, error: "Invalid method" };

  try {
    const formData = await request.formData();
    const intent = formData.get("intent");

    const currentRegistration = await getRegistrationDetails(id, shop);
    if (!currentRegistration) {
      return { success: false, error: "Customer not found" };
    }

    if (intent === "delete") {
      const rawMode = (formData.get("deleteMode") as string | null)?.trim() || "both";
      const deleteMode = rawMode === "shopify" || rawMode === "app" || rawMode === "both" ? rawMode : "both";
      await deleteCustomer(admin, id, deleteMode);
      return redirect("/app/customers");
    }

    if (intent === "resendRejection") {
      const email = currentRegistration.email?.trim();
      if (email) {
        let shopName = "Store";
        let shopEmail = "";
        try {
          const shopRes = await admin.graphql(`#graphql query { shop { name contactEmail } }`);
          const parsed = await parseShopFromGraphqlResponse(shopRes);
          shopName = parsed.shopName;
          shopEmail = parsed.shopEmail;
        } catch { /* use defaults */ }
        shopName = getShopDisplayName(shop, shopName);
        const result = await sendRejectionEmail(shop, email, {
          shopName,
          shopEmail,
          customerFirstName: currentRegistration.firstName?.trim() || "Customer",
        });
        return { success: result.sent, error: result.reason ?? undefined, resendRejection: true };
      }
      return { success: false, error: "No email for this customer.", resendRejection: true };
    }

    if (intent === "resendApproval") {
      const email = currentRegistration.email?.trim();
      if (email) {
        let shopName = "Store";
        let shopEmail = "";
        try {
          const shopRes = await admin.graphql(`#graphql query { shop { name contactEmail } }`);
          const parsed = await parseShopFromGraphqlResponse(shopRes);
          shopName = parsed.shopName;
          shopEmail = parsed.shopEmail;
        } catch { /* use defaults */ }
        shopName = getShopDisplayName(shop, shopName);
        const result = await sendApprovalEmail(shop, email, {
          shopName,
          shopEmail,
          customerFirstName: currentRegistration.firstName?.trim() || "Customer",
          activationUrl: undefined,
        });
        return { success: result.sent, error: result.reason ?? undefined, resendApproval: true };
      }
      return { success: false, error: "No email for this customer.", resendApproval: true };
    }

    if (intent !== "save") return { success: false, error: "Invalid intent" };

    const newStatus = formData.get("status") as string;

    let approvalActivationUrl: string | null = null;
    // When saving as "Approved", if this is a pending registration (db-*), create customer in Shopify first
    if (newStatus === "approved" && id.startsWith("db-")) {
      if (currentRegistration.status === "pending") {
        try {
          const { activationUrl } = await approveCustomer(admin, id, shop, session?.accessToken ?? "");
          if (activationUrl) approvalActivationUrl = activationUrl;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to create customer in Shopify";
          return { success: false, error: message };
        }
      }
    }

    const existingCustomData = currentRegistration.customData as Record<string, unknown> || {};
    const mergedCustomData: Record<string, unknown> = { ...existingCustomData };
    
    const phoneRaw = (formData.get("phone") as string) || "";
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    if (phoneDigits && (phoneDigits.length < 8 || phoneDigits.length > 15)) {
      return { success: false, error: "Phone number must be between 8 and 15 digits." };
    }

    for (const [key, value] of formData.entries()) {
      if (typeof key === "string" && key.startsWith("customData.") && typeof value === "string") {
        mergedCustomData[key.slice("customData.".length)] = value;
      }
    }

    const result = await updateRegistrationDetails(id, shop, {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      phone: (formData.get("phone") as string) || null,
      company: (formData.get("company") as string) || null,
      note: (formData.get("note") as string) || null,
      status: newStatus,
      customData: Object.keys(mergedCustomData).length > 0 ? mergedCustomData as Record<string, string> : undefined,
    });

    if (result.error) return { success: false, error: result.error };

    if (newStatus === "denied") {
      const toEmail = currentRegistration.email?.trim();
      if (toEmail) {
        let shopName = "Store";
        let shopEmail = "";
        try {
          const shopRes = await admin.graphql(`#graphql query { shop { name contactEmail } }`);
          const parsed = await parseShopFromGraphqlResponse(shopRes);
          shopName = parsed.shopName;
          shopEmail = parsed.shopEmail;
        } catch { /* use defaults */ }
        shopName = getShopDisplayName(shop, shopName);
        await sendRejectionEmail(shop, toEmail, {
          shopName,
          shopEmail,
          customerFirstName: (formData.get("firstName") as string)?.trim() || currentRegistration.firstName?.trim() || "Customer",
        });
      }
    }

    const didJustApprove = id.startsWith("db-") && currentRegistration.status === "pending" && newStatus === "approved";
    if (newStatus === "approved" && didJustApprove) {
      const toEmail = currentRegistration.email?.trim();
      if (toEmail) {
        let shopName = "Store";
        let shopEmail = "";
        try {
          const shopRes = await admin.graphql(`#graphql query { shop { name contactEmail } }`);
          const parsed = await parseShopFromGraphqlResponse(shopRes);
          shopName = parsed.shopName;
          shopEmail = parsed.shopEmail;
        } catch { /* use defaults */ }
        shopName = getShopDisplayName(shop, shopName);
        await sendApprovalEmail(shop, toEmail, {
          shopName,
          shopEmail,
          customerFirstName: (formData.get("firstName") as string)?.trim() || currentRegistration.firstName?.trim() || "Customer",
          activationUrl: approvalActivationUrl ?? undefined,
        });
      }
    }

    // Sync approved customer edits to Shopify
    const shopifyCustomerId = id.startsWith("db-")
      ? currentRegistration.customerId ?? null
      : id;
    if (shopifyCustomerId) {
      const firstName = (formData.get("firstName") as string)?.trim() ?? "";
      const lastName = (formData.get("lastName") as string)?.trim() ?? "";
      const phone = (formData.get("phone") as string)?.trim() || null;
      const company = (formData.get("company") as string)?.trim() || null;
      const note = (formData.get("note") as string)?.trim() || null;
      const updateResult = await updateShopifyCustomer(admin, shop, shopifyCustomerId, {
        firstName,
        lastName,
        phone,
        note,
        company,
        customData: Object.keys(mergedCustomData).length > 0 ? mergedCustomData as Record<string, string> : undefined,
      });
      if (updateResult.error) return { success: false, error: updateResult.error };
    }

    return { success: true };
  } catch (error) {
    console.error("Error saving customer details", error);
    return { success: false, error: "Failed to save customer details. Please try again later." };
  }
};

export default function CustomerDetailPage() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<Awaited<ReturnType<typeof action>>>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const fetcher = useFetcher<Awaited<ReturnType<typeof action>>>();
  const deleteFetcher = useFetcher();
  const isSaving = navigation.state === "submitting";
  const resendResult =
    fetcher.data && isActionJson(fetcher.data) && fetcher.data.resendRejection
      ? fetcher.data
      : null;
  const resendApprovalResult =
    fetcher.data && isActionJson(fetcher.data) && fetcher.data.resendApproval
      ? fetcher.data
      : null;
  const [showResendSuccessBanner, setShowResendSuccessBanner] = useState(true);
  const [showResendErrorBanner, setShowResendErrorBanner] = useState(true);
  const [showResendApprovalSuccessBanner, setShowResendApprovalSuccessBanner] = useState(true);
  const [showResendApprovalErrorBanner, setShowResendApprovalErrorBanner] = useState(true);

  useEffect(() => {
    if (resendResult) {
      setShowResendSuccessBanner(true);
      setShowResendErrorBanner(true);
    }
  }, [resendResult]);

  useEffect(() => {
    if (resendApprovalResult) {
      setShowResendApprovalSuccessBanner(true);
      setShowResendApprovalErrorBanner(true);
    }
  }, [resendApprovalResult]);

  const handleDownload = useCallback(async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed. Please try again.");
    }
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("pending");
  const [customDataValues, setCustomDataValues] = useState<Record<string, string>>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const hasSyncedFromLoaderRef = useRef(false);

  useEffect(() => {
    if ("error" in data) return;

    const nextFirstName = data.firstName ?? "";
    if (firstName !== nextFirstName) setFirstName(nextFirstName);

    const nextLastName = data.lastName ?? "";
    if (lastName !== nextLastName) setLastName(nextLastName);

    const nextEmail = data.email ?? "";
    if (email !== nextEmail) setEmail(nextEmail);

    const loadedPhone = data.phone ?? "";
    if (phone !== loadedPhone) setPhone(loadedPhone);
    const loadedDigits = loadedPhone.replace(/\D/g, "");
    if (loadedDigits && (loadedDigits.length < 8 || loadedDigits.length > 15)) {
      if (phoneError !== "Phone number must be between 8 and 15 digits.") {
        setPhoneError("Phone number must be between 8 and 15 digits.");
      }
    } else if (phoneError !== null) {
      setPhoneError(null);
    }

    const nextCompany = data.company ?? "";
    if (company !== nextCompany) setCompany(nextCompany);

    const nextNote = data.note ?? "";
    if (note !== nextNote) setNote(nextNote);

    const nextStatus = data.status ?? "pending";
    if (status !== nextStatus) setStatus(nextStatus);

    if (data.customData && typeof data.customData === "object" && !Array.isArray(data.customData)) {
      const cd = data.customData as Record<string, unknown>;
      const initial: Record<string, string> = {};
      Object.entries(cd).forEach(([key, value]) => {
        if (value == null) return;
        const normalized = normalizeCustomDataValueForText(value);
        if (normalized !== "") {
          initial[key] = normalized;
        }
      });
      const initialJson = JSON.stringify(initial);
      if (JSON.stringify(customDataValues) !== initialJson) {
        setCustomDataValues(initial);
      }
    } else if (Object.keys(customDataValues).length > 0) {
      setCustomDataValues({});
    }

    hasSyncedFromLoaderRef.current = true;
  }, [data, firstName, lastName, email, phone, phoneError, company, note, status, customDataValues]);

  const hasUnsavedChanges = useMemo(() => {
    if (!hasSyncedFromLoaderRef.current || "error" in data) return false;

    const baseEqual =
      firstName === (data.firstName ?? "") &&
      lastName === (data.lastName ?? "") &&
      email === (data.email ?? "") &&
      phone === (data.phone ?? "") &&
      company === (data.company ?? "") &&
      note === (data.note ?? "") &&
      status === (data.status ?? "pending");

    if (!baseEqual) return true;

    if (
      !data.customData ||
      typeof data.customData !== "object" ||
      Array.isArray(data.customData)
    ) {
      return false;
    }

    return Object.entries(data.customData as Record<string, unknown>).some(
      ([key, value]) => {
        const original = normalizeCustomDataValueForText(value);
        return (customDataValues[key] ?? original) !== original;
      }
    );
  }, [data, firstName, lastName, email, phone, company, note, status, customDataValues]);

  const handleDiscard = useCallback(() => {
    if ("error" in data) return;
    setFirstName(data.firstName ?? "");
    setLastName(data.lastName ?? "");
    setEmail(data.email ?? "");
    setPhone(data.phone ?? "");
    setCompany(data.company ?? "");
    setNote(data.note ?? "");
    setStatus(data.status ?? "pending");
    if (data.customData && typeof data.customData === "object" && !Array.isArray(data.customData)) {
      const cd = data.customData as Record<string, unknown>;
      const reset: Record<string, string> = {};
      Object.entries(cd).forEach(([key, value]) => {
        if (value == null) return;
        if (typeof value === "string") {
          reset[key] = value;
        } else if (typeof value === "number" || typeof value === "boolean") {
          reset[key] = String(value);
        }
      });
      setCustomDataValues(reset);
    } else {
      setCustomDataValues({});
    }
  }, [data]);

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    const digits = value.replace(/\D/g, "");
    if (digits && (digits.length < 8 || digits.length > 15)) {
      setPhoneError("Phone number must be between 8 and 15 digits.");
    } else {
      setPhoneError(null);
    }
  };

  const handleBack = useCallback(() => {
    navigate("/app/customers");
  }, [navigate]);

  const statusOptions = useMemo(
    () => {
      if (!data || "error" in data) {
        return [
          { label: "Pending", value: "pending" },
          { label: "Approved", value: "approved" },
        ];
      }
      return [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        ...(data.status !== "approved" ? [{ label: "Rejected", value: "denied" as const }] : []),
      ];
    },
    [data]
  );

  if (!data || "error" in data) {
    return (
      <Page title="Customer" backAction={{ content: "Back", onAction: handleBack }}>
        <LegacyCard sectioned>
          <Text as="p" tone="critical">Customer not found.</Text>
        </LegacyCard>
      </Page>
    );
  }

  return (
    <Page
      title={`${data.firstName} ${data.lastName}`}
      backAction={{ content: "Back", onAction: handleBack }}
    >
      <BlockStack gap="400">
        {actionData && isActionJson(actionData) && actionData.success && (
          <Banner tone="success" onDismiss={() => {}}>
            Customer details saved.
          </Banner>
        )}
        {actionData && isActionJson(actionData) && actionData.error && (
          <Banner tone="critical" onDismiss={() => {}}>
            {actionData.error}
          </Banner>
        )}
        <Form id="customer-edit-form" method="post">
          <input type="hidden" name="intent" value="save" />
          <input type="hidden" name="status" value={status} />
          <LegacyCard title="Registration details" sectioned>
            <BlockStack gap="400">
              <TextField
                label="First name"
                name="firstName"
                value={firstName}
                onChange={setFirstName}
                autoComplete="given-name"
              />
              <TextField
                label="Last name"
                name="lastName"
                value={lastName}
                onChange={setLastName}
                autoComplete="family-name"
              />
              <>
                <input type="hidden" name="email" value={email} />
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  disabled
                  helpText="Email cannot be changed from the admin. Ask the customer to update it in their Shopify account."
                />
              </>
              <TextField
                label="Phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                autoComplete="tel"
                error={phoneError ?? undefined}
              />
              <TextField
                label="Company"
                name="company"
                value={company}
                onChange={setCompany}
                autoComplete="organization"
              />
              <Select
                label="Status"
                options={statusOptions}
                value={status}
                onChange={setStatus}
                disabled={data.status === "approved"}
              />
              {data.status === "denied" && (
                <InlineStack gap="200" blockAlign="start">
                  <Button
                    loading={fetcher.state !== "idle"}
                    variant="secondary"
                    onClick={() => fetcher.submit({ intent: "resendRejection" }, { method: "post" })}
                  >
                    Resend rejection email
                  </Button>
                </InlineStack>
              )}
              {data.status === "approved" && (
                <InlineStack gap="200" blockAlign="start">
                  <Button
                    loading={fetcher.state !== "idle"}
                    variant="secondary"
                    onClick={() => fetcher.submit({ intent: "resendApproval" }, { method: "post" })}
                  >
                    Resend approval email
                  </Button>
                </InlineStack>
              )}
              {resendResult && resendResult.success && showResendSuccessBanner && (
                <Banner tone="success" onDismiss={() => setShowResendSuccessBanner(false)}>
                  Rejection email sent.
                </Banner>
              )}
              {resendResult && !resendResult.success && resendResult.error && showResendErrorBanner && (
                <Banner tone="critical" onDismiss={() => setShowResendErrorBanner(false)}>
                  {resendResult.error}
                </Banner>
              )}
              {resendApprovalResult && resendApprovalResult.success && showResendApprovalSuccessBanner && (
                <Banner tone="success" onDismiss={() => setShowResendApprovalSuccessBanner(false)}>
                  Approval email sent.
                </Banner>
              )}
              {resendApprovalResult && !resendApprovalResult.success && resendApprovalResult.error && showResendApprovalErrorBanner && (
                <Banner tone="critical" onDismiss={() => setShowResendApprovalErrorBanner(false)}>
                  {resendApprovalResult.error}
                </Banner>
              )}
              <input type="hidden" name="note" value={note} />

              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Date joined</Text>
                <Text as="p">{data.createdAt ? new Date(data.createdAt).toLocaleString() : "—"}</Text>
              </BlockStack>
              {data.reviewedAt && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Reviewed at</Text>
                  <Text as="p">{new Date(data.reviewedAt).toLocaleString()}</Text>
                </BlockStack>
              )}
              {data.reviewedBy && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Reviewed by</Text>
                  <Text as="p">{data.reviewedBy}</Text>
                </BlockStack>
              )}
              {data.customData &&
                typeof data.customData === "object" &&
                !Array.isArray(data.customData) &&
                Object.keys(data.customData).length > 0 && (
                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Uploaded files / other fields
                    </Text>
                    {Object.entries(data.customData as Record<string, unknown>).map(
                      ([key, value]) => {
                        type FileEntry = { name?: string; size?: number; type?: string; url?: string; data?: string };
                        let fileList: FileEntry[] = [];
                        let isFileField = false;
                        let plainText = "";

                        const normalizeFiles = (raw: unknown): FileEntry[] => {
                          const arr = Array.isArray(raw) ? raw : [raw];
                          const first = arr[0] as Record<string, unknown> | null;
                          if (first && (first.url || first.data)) {
                            return arr as FileEntry[];
                          }
                          return [];
                        };

                        if (value !== null && typeof value === "object") {
                          if (Array.isArray(value)) {
                            const primitives = (value as unknown[]).filter(
                              (item) =>
                                item !== null &&
                                (typeof item === "string" ||
                                  typeof item === "number" ||
                                  typeof item === "boolean")
                            );
                            if (primitives.length > 0 && primitives.length === value.length) {
                              plainText = primitives.map((item) => String(item)).join("\n");
                            } else {
                              const files = normalizeFiles(value);
                              if (files.length > 0) {
                                fileList = files;
                                isFileField = true;
                              } else {
                                plainText = JSON.stringify(value);
                              }
                            }
                          } else {
                            const files = normalizeFiles(value);
                            if (files.length > 0) {
                              fileList = files;
                              isFileField = true;
                            } else {
                              plainText = JSON.stringify(value);
                            }
                          }
                        } else if (typeof value === "string") {
                          const trimmed = value.trim();
                          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                            try {
                              const parsed = JSON.parse(trimmed);
                              const files = normalizeFiles(parsed);
                              if (files.length > 0) {
                                fileList = files;
                                isFileField = true;
                              } else if (Array.isArray(parsed)) {
                                const primitives = (parsed as unknown[]).filter(
                                  (item) =>
                                    item !== null &&
                                    (typeof item === "string" ||
                                      typeof item === "number" ||
                                      typeof item === "boolean")
                                );
                                if (primitives.length > 0 && primitives.length === parsed.length) {
                                  plainText = primitives.map((item) => String(item)).join("\n");
                                } else {
                                  plainText = trimmed;
                                }
                              } else {
                                plainText = trimmed;
                              }
                            } catch { plainText = value; }
                          } else { plainText = value; }
                        } else {
                          plainText = value != null ? String(value) : "";
                        }

                        const label = data.customDataLabels?.[key] ?? key.replace(/_/g, " ");

                        let displayValue = customDataValues[key] ?? plainText;
                        if (
                          typeof displayValue === "string" &&
                          displayValue.length === 2 &&
                          /^[A-Z]{2}$/.test(displayValue) &&
                          /country/i.test(label)
                        ) {
                          try {
                            const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
                            const fullName = regionNames.of(displayValue);
                            if (fullName) {
                              displayValue = fullName;
                            }
                          } catch {
                            // ignore unsupported Intl.DisplayNames
                          }
                        }

                        const currentValue = displayValue;
                        const isMultiline = currentValue.includes("\n");

                        return (
                          <BlockStack key={key} gap="200">
                            <Text as="p" variant="bodySm" fontWeight="medium">
                              {label}
                            </Text>
                            {isFileField ? (
                              <BlockStack gap="200">
                                {fileList.map((file, idx) => {
                                  const name = file.name || `File ${idx + 1}`;
                                  const sizeKb = typeof file.size === "number" ? (file.size / 1024).toFixed(1) + " KB" : "";
                                  const mime = file.type || "";
                                  const isImage = mime.startsWith("image/");
                                  
                                  return (
                                    <Box
                                      key={idx}
                                      padding="300"
                                      background="bg-surface-secondary"
                                      borderRadius="200"
                                    >
                                      <InlineStack gap="400" align="space-between" blockAlign="center">
                                        <InlineStack gap="300" blockAlign="center">
                                          <Thumbnail
                                            source={isImage && file.url ? file.url : FileIcon}
                                            alt={name}
                                            size="small"
                                          />
                                          <BlockStack gap="050">
                                            <Text as="p" fontWeight="medium" breakWord>
                                              {name}
                                            </Text>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              {[sizeKb, mime].filter(Boolean).join(" · ")}
                                            </Text>
                                          </BlockStack>
                                        </InlineStack>
                                        
                                        <ButtonGroup variant="segmented">
                                          {file.url ? (
                                            <>
                                              <Button
                                                size="slim"
                                                url={file.url}
                                                target="_blank"
                                              >
                                                View
                                              </Button>
                                              <Button
                                                size="slim"
                                                onClick={() => handleDownload(file.url!, name)}
                                              >
                                                Download
                                              </Button>
                                            </>
                                          ) : (
                                            <Button
                                              size="slim"
                                              url={`/app/customer-file/${encodeURIComponent(data.id as string)}?field=${encodeURIComponent(key)}&index=${idx}`}
                                            >
                                              Download
                                            </Button>
                                          )}
                                        </ButtonGroup>
                                      </InlineStack>
                                    </Box>
                                  );
                                })}
                              </BlockStack>
                            ) : (
                              <TextField
                                label={label}
                                labelHidden
                                name={`customData.${key}`}
                                value={currentValue}
                                onChange={(v) =>
                                  setCustomDataValues((prev) => ({
                                    ...prev,
                                    [key]: v,
                                  }))
                                }
                                autoComplete="off"
                                multiline={isMultiline}
                              />
                            )}
                          </BlockStack>
                        );
                      }
                    )}
                  </BlockStack>
                )}
              <InlineStack gap="300" wrap blockAlign="start">
                <Button
                  variant="primary"
                  submit
                  loading={isSaving}
                  disabled={isSaving || !!phoneError}
                >
                  Save changes
                </Button>
                {hasUnsavedChanges && (
                  <Button variant="secondary" onClick={handleDiscard} disabled={isSaving}>
                    Discard
                  </Button>
                )}
                <Button
                  variant="primary"
                  tone="critical"
                  loading={deleteFetcher.state !== "idle"}
                  disabled={isSaving}
                  onClick={() => setShowDeleteModal(true)}
                >
                  Delete customer
                </Button>
              </InlineStack>
            </BlockStack>
          </LegacyCard>
        </Form>
        <Modal
          open={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete customer?"
          secondaryActions={[{ content: "Cancel", onAction: () => setShowDeleteModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                Choose how you want to delete this customer. This action cannot be undone.
              </Text>
              <BlockStack gap="300">
                <button
                  type="button"
                  disabled={deleteFetcher.state !== "idle"}
                  onClick={() => {
                    deleteFetcher.submit({ intent: "delete", deleteMode: "shopify" }, { method: "post" });
                    setShowDeleteModal(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: "1px solid #d0d4d9",
                    backgroundColor: "#ffffff",
                    textAlign: "left",
                    cursor: deleteFetcher.state !== "idle" ? "default" : "pointer",
                  }}
                >
                  <BlockStack gap="050">
                    <Text as="p" fontWeight="semibold">
                      Delete from Shopify only
                    </Text>
                    <Text as="p" tone="subdued">
                      Remove customer from Shopify backend. App records will remain.
                    </Text>
                  </BlockStack>
                </button>

                <button
                  type="button"
                  disabled={deleteFetcher.state !== "idle"}
                  onClick={() => {
                    deleteFetcher.submit({ intent: "delete", deleteMode: "app" }, { method: "post" });
                    setShowDeleteModal(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: "1px solid #d0d4d9",
                    backgroundColor: "#ffffff",
                    textAlign: "left",
                    cursor: deleteFetcher.state !== "idle" ? "default" : "pointer",
                  }}
                >
                  <BlockStack gap="050">
                    <Text as="p" fontWeight="semibold">
                      Delete from App server only
                    </Text>
                    <Text as="p" tone="subdued">
                      Remove from app database. Shopify customer will remain.
                    </Text>
                  </BlockStack>
                </button>

                <button
                  type="button"
                  disabled={deleteFetcher.state !== "idle"}
                  onClick={() => {
                    deleteFetcher.submit({ intent: "delete", deleteMode: "both" }, { method: "post" });
                    setShowDeleteModal(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: "1px solid #ef4444",
                    backgroundColor: "#fef2f2",
                    textAlign: "left",
                    cursor: deleteFetcher.state !== "idle" ? "default" : "pointer",
                  }}
                >
                  <BlockStack gap="050">
                    <Text as="p" fontWeight="semibold" tone="critical">
                      Delete from Both
                    </Text>
                    <Text as="p" tone="critical">
                      Remove customer from Shopify and app database. This cannot be undone.
                    </Text>
                  </BlockStack>
                </button>
              </BlockStack>
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const navigate = useNavigate();
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong while loading this customer.";

  const handleBack = () => {
    navigate("/app/customers");
  };

  return (
    <Page
      title="Customer"
      backAction={{ content: "Back", onAction: handleBack }}
    >
      <LegacyCard sectioned>
        <BlockStack gap="400">
          <Text as="h2" variant="headingSm">
            Application error
          </Text>
          <Text as="p" tone="critical">
            {message}
          </Text>
          <Button onClick={() => navigate("/app/customers")}>Back to customers</Button>
        </BlockStack>
      </LegacyCard>
    </Page>
  );
}
