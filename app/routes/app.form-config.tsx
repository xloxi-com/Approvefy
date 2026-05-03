// Form Configuration page - lists forms (example UI: Form ID, Name, Form type, Status, Actions)
import { useState, useCallback, useEffect, Suspense } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Await, Link, useLoaderData, useNavigate, useSubmit, useRevalidator, useActionData } from "react-router";
import {
    Badge,
    Box,
    Card,
    EmptyState,
    IndexTable,
    InlineGrid,
    Layout,
    Page,
    Text,
    Button,
    useIndexResourceState,
    Modal,
    BlockStack,
    Banner,
    InlineStack,
    Toast,
} from "@shopify/polaris";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "../components/SectionCard";
import { EditIcon, DeleteIcon, PlusIcon, ClipboardIcon, DuplicateIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const FORM_TYPES = [
    { value: "wholesale", label: "Wholesale registration form", description: "Wholesale registration form helps streamline the registration process for companies that sell products to retailers or distributors.", displayCondition: "This form can show on all pages of the store-front." },
    { value: "multi_step", label: "Multi-step form", description: "Multi-step form helps gather detailed information about potential partners or distributors step by step.", displayCondition: "This form can only show on Customer Account Page after login." },
] as const;

interface FormConfigItem {
    id: string;
    shop: string;
    name: string;
    formType: string;
    status: "enabled" | "disabled";
    fieldsCount: number;
    isDefault: boolean;
    createdAt: string;
    [key: string]: unknown;
}

type FormConfigListRow = {
    id: string;
    shop: string;
    name: string | null;
    formType: string | null;
    enabled: boolean | null;
    isDefault: boolean | null;
    createdAt: Date;
    fieldsCount: number | bigint;
};

/** List query only — avoids loading large `fields` JSON into Node (big win for heavy forms). */
async function fetchFormsForShop(shop: string): Promise<FormConfigItem[]> {
    try {
        const rows = await prisma.$queryRaw<FormConfigListRow[]>`
            SELECT
                fc."id",
                fc."shop",
                fc."name",
                fc."formType",
                fc."enabled",
                fc."isDefault",
                fc."createdAt",
                CASE
                    WHEN jsonb_typeof(fc."fields") = 'array' THEN jsonb_array_length(fc."fields")
                    ELSE 0
                END AS "fieldsCount"
            FROM "FormConfig" fc
            WHERE fc."shop" = ${shop}
            ORDER BY fc."createdAt" ASC
        `;
        return rows.map((row) => ({
            id: row.id,
            shop: row.shop,
            name: (row.name ?? "").trim() || "Registration Form",
            formType: row.formType ?? "wholesale",
            status: row.enabled !== false ? "enabled" : "disabled",
            fieldsCount: Number(row.fieldsCount),
            isDefault: row.isDefault ?? false,
            createdAt: row.createdAt.toISOString(),
        }));
    } catch (e) {
        console.warn("Form config fetch failed:", e);
        return [];
    }
}

export type FormConfigLoaderData = {
    themeEditorUrl: string;
    /** Resolved progressively — wrap in `<Await>` + `<Suspense>` with a skeleton fallback. */
    forms: Promise<FormConfigItem[]>;
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<FormConfigLoaderData> => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
    const themeEditorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?template=customers/register&context=apps`;

    return {
        themeEditorUrl,
        forms: fetchFormsForShop(shop),
    };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === "delete") {
        const formId = formData.get("formId") as string | null;
        if (!formId) return { success: false, error: "Missing form ID" };
        try {
            await prisma.formConfig.deleteMany({ where: { id: formId, shop } });
            return { success: true };
        } catch (e) {
            console.error("Form delete failed:", e);
            return { success: false, error: "Failed to delete form" };
        }
    }
    if (intent === "clone") {
        const formId = formData.get("formId") as string | null;
        if (!formId) return { success: false, error: "Missing form ID" };
        try {
            const source = await prisma.formConfig.findFirst({ where: { id: formId, shop } });
            if (!source) return { success: false, error: "Form not found" };
            const row = source as {
                name?: string;
                formType?: string;
                fields?: unknown;
                enabled?: boolean;
                showProgressBar?: boolean;
            };
            const name = (row.name ?? "Registration Form").trim();
            const copyName = name.length > 0 ? `${name} (Copy)` : "Registration Form (Copy)";
            const newForm = await prisma.formConfig.create({
                data: {
                    shop,
                    name: copyName,
                    formType: row.formType ?? "wholesale",
                    fields: row.fields ?? [],
                    isDefault: false,
                    enabled: row.enabled !== false,
                    showProgressBar:
                        (row.formType ?? "wholesale") === "multi_step" ? row.showProgressBar !== false : false,
                } as never,
            });
            return { success: true, clonedFormId: newForm.id };
        } catch (e) {
            console.error("Form clone failed:", e);
            return { success: false, error: "Failed to clone form" };
        }
    }
    return { success: false };
};

const FORM_INDEX_TABLE_HEADINGS = [
    { title: "Form ID" },
    { title: "Name" },
    { title: "Form type" },
    { title: "Status" },
    { title: "Actions" },
] as const;

function FormConfigListLoading() {
    const rowKeys = ["s1", "s2", "s3", "s4", "s5"] as const;
    return (
        <div className="app-backend-card">
            <Card padding="0">
                <div
                    className="flex min-h-[240px] flex-col gap-4 p-4"
                    role="status"
                    aria-label="Loading forms"
                >
                    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3">
                        {FORM_INDEX_TABLE_HEADINGS.map((h) => (
                            <Skeleton key={h.title} className="h-4 w-20" />
                        ))}
                    </div>
                    {rowKeys.map((key) => (
                        <div
                            key={key}
                            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-3"
                        >
                            <Skeleton className="h-4 w-full max-w-[140px]" />
                            <Skeleton className="h-4 w-full max-w-[180px]" />
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

function formTypeLabel(value: string): string {
    const v = (value || "").toLowerCase();
    if (v === "wholesale") return "Wholesale registration form";
    if (v === "multi_step") return "Multi-step form";
    return FORM_TYPES.find((t) => t.value === value)?.label ?? value;
}

type FormConfigDataViewProps = {
    forms: FormConfigItem[];
    themeEditorUrl: string;
    navigate: ReturnType<typeof useNavigate>;
    onCopyFormId: (formId: string) => void;
    onDeleteClick: (form: FormConfigItem) => void;
    onCloneForm: (form: FormConfigItem) => void;
    onOpenCreate: () => void;
};

function FormConfigDataView({
    forms,
    themeEditorUrl,
    navigate,
    onCopyFormId,
    onDeleteClick,
    onCloneForm,
    onOpenCreate,
}: FormConfigDataViewProps) {
    const resourceName = { singular: "form", plural: "forms" };
    const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(forms);

    const emptyStateMarkup = !forms.length ? (
        <EmptyState
            heading="No forms configured"
            action={{
                content: "Create form",
                onAction: onOpenCreate,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
            <p>Build your first registration form to start collecting B2B customer applications.</p>
        </EmptyState>
    ) : null;

    const rowMarkup = forms.map((form, index) => (
        <IndexTable.Row
            id={form.id}
            key={form.id}
            selected={selectedResources.includes(form.id)}
            position={index}
        >
            <IndexTable.Cell>
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Text as="span" variant="bodyMd" tone="subdued">
                        {form.id}
                    </Text>
                    <Button
                        variant="plain"
                        icon={ClipboardIcon}
                        accessibilityLabel="Copy form ID for app embed"
                        onClick={() => onCopyFormId(form.id)}
                    />
                </InlineStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Link to={`/app/form-builder?formId=${encodeURIComponent(form.id)}`} className="form-config-name-link">
                    {form.name}
                </Link>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Badge tone="info">{formTypeLabel(form.formType)}</Badge>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Badge tone="success">{form.status === "enabled" ? "Enabled" : "Disabled"}</Badge>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <InlineStack gap="100" blockAlign="center" wrap={false}>
                    <Button
                        variant="plain"
                        icon={EditIcon}
                        accessibilityLabel="Edit form"
                        onClick={() => navigate(`/app/form-builder?formId=${encodeURIComponent(form.id)}`)}
                    />
                    <Button variant="plain" icon={DuplicateIcon} accessibilityLabel="Clone form" onClick={() => onCloneForm(form)} />
                    <Button variant="plain" icon={DeleteIcon} accessibilityLabel="Delete form" tone="critical" onClick={() => onDeleteClick(form)} />
                </InlineStack>
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    return (
        <>
            {forms.length > 0 && (
                <Box paddingBlockEnd="300">
                    <Banner tone="info">
                        <BlockStack gap="200">
                            <Text as="p">
                                In Theme Editor, open <strong>App embeds</strong> and enable <strong>Approvefy</strong>.
                                Use <strong>Form to display</strong> only when you want a specific Form ID; leave it blank to use the default form.
                            </Text>
                            <InlineStack gap="200">
                                <Button url={themeEditorUrl} target="_blank">
                                    Customize theme
                                </Button>
                            </InlineStack>
                        </BlockStack>
                    </Banner>
                </Box>
            )}
            <div className="app-backend-card">
                <Card padding="0">
                    <div className="form-config-table-wrapper">
                        {emptyStateMarkup ?? (
                            <IndexTable
                                resourceName={resourceName}
                                itemCount={forms.length}
                                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                                onSelectionChange={handleSelectionChange}
                                headings={[...FORM_INDEX_TABLE_HEADINGS]}
                                selectable={false}
                            >
                                {rowMarkup}
                            </IndexTable>
                        )}
                    </div>
                </Card>
            </div>
        </>
    );
}

export default function FormConfig() {
    const { forms, themeEditorUrl } = useLoaderData<FormConfigLoaderData>();
    const actionData = useActionData<{ success?: boolean; clonedFormId?: string; error?: string }>();
    const navigate = useNavigate();
    const submit = useSubmit();
    const revalidator = useRevalidator();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [formToDelete, setFormToDelete] = useState<FormConfigItem | null>(null);
    const [copyToast, setCopyToast] = useState(false);
    const [cloneToast, setCloneToast] = useState(false);

    const handleBack = useCallback(() => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate("/app/customers");
        }
    }, [navigate]);

    const handleCopyFormId = useCallback((formId: string) => {
        void navigator.clipboard.writeText(formId).then(() => {
            setCopyToast(true);
        });
    }, []);

    const handleDeleteClick = useCallback((form: FormConfigItem) => {
        setFormToDelete(form);
        setDeleteModalOpen(true);
    }, []);

    const handleDeleteConfirm = useCallback(() => {
        if (!formToDelete) return;
        const fd = new FormData();
        fd.set("intent", "delete");
        fd.set("formId", formToDelete.id);
        submit(fd, { method: "post" });
        setDeleteModalOpen(false);
        setFormToDelete(null);
    }, [formToDelete, submit]);

    const handleCloneForm = useCallback(
        (form: FormConfigItem) => {
            const fd = new FormData();
            fd.set("intent", "clone");
            fd.set("formId", form.id);
            submit(fd, { method: "post" });
        },
        [submit],
    );

    useEffect(() => {
        if (actionData?.success && actionData?.clonedFormId) {
            revalidator.revalidate();
            setCloneToast(true);
        }
    }, [actionData?.success, actionData?.clonedFormId, revalidator]);

    const createFormAction = (
        <Button variant="primary" icon={PlusIcon} onClick={() => setCreateModalOpen(true)}>
            Create form
        </Button>
    );

    return (
        <>
            <Modal
                open={deleteModalOpen}
                onClose={() => {
                    setDeleteModalOpen(false);
                    setFormToDelete(null);
                }}
                title="Delete form?"
                primaryAction={{
                    content: "Delete",
                    destructive: true,
                    onAction: handleDeleteConfirm,
                }}
                secondaryActions={[
                    {
                        content: "Cancel",
                        onAction: () => {
                            setDeleteModalOpen(false);
                            setFormToDelete(null);
                        },
                    },
                ]}
            >
                <Modal.Section>
                    <Text as="p">
                        Are you sure you want to delete &quot;{formToDelete?.name}&quot;? This cannot be undone.
                    </Text>
                </Modal.Section>
            </Modal>
            <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create form" size="large">
                <Modal.Section>
                    <BlockStack gap="400">
                        <Text as="p" tone="subdued">
                            Choose the form layout that best matches how you want customers to register. You can edit all fields later.
                        </Text>
                        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                            {FORM_TYPES.map((t) => (
                                <SectionCard key={t.value}>
                                    <BlockStack gap="300">
                                        <Text as="h2" variant="headingMd" fontWeight="bold">
                                            {t.label}
                                        </Text>
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            {t.description}
                                        </Text>
                                        <Box paddingBlockStart="200">
                                            <Button
                                                fullWidth
                                                variant="primary"
                                                onClick={() => {
                                                    setCreateModalOpen(false);
                                                    navigate(`/app/form-builder?new=1&formType=${encodeURIComponent(t.value)}`);
                                                }}
                                            >
                                                Create form
                                            </Button>
                                        </Box>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            {t.displayCondition}
                                        </Text>
                                    </BlockStack>
                                </SectionCard>
                            ))}
                        </InlineGrid>
                    </BlockStack>
                </Modal.Section>
            </Modal>
            {copyToast && (
                <Toast content="Form ID copied. Paste it in the theme app embed block (Form to display)." onDismiss={() => setCopyToast(false)} />
            )}
            {cloneToast && (
                <Toast content="Form cloned successfully. The new form appears in the list." onDismiss={() => setCloneToast(false)} />
            )}
            <Page title="Form configuration" backAction={{ content: "Back", onAction: handleBack }} primaryAction={createFormAction}>
                <div className="app-nav-tabs-mobile">
                    <Box paddingBlockEnd="200">
                        <InlineStack gap="100" wrap>
                            <Link to="/app">
                                <Button size="slim">Overview</Button>
                            </Link>
                            <Button size="slim" onClick={() => navigate("/app/customers")}>
                                Customers
                            </Button>
                            <Button size="slim" variant="primary">
                                Form Builder
                            </Button>
                            <Button size="slim" onClick={() => navigate("/app/settings")}>
                                Settings
                            </Button>
                        </InlineStack>
                    </Box>
                </div>
                <Layout>
                    <Layout.Section>
                        <Suspense fallback={<FormConfigListLoading />}>
                            <Await
                                resolve={forms}
                                errorElement={
                                    <div className="app-backend-card">
                                        <Card>
                                            <Box padding="400">
                                                <Banner tone="critical" title="Could not load forms">
                                                    <p>Refresh the page or try again in a moment.</p>
                                                </Banner>
                                            </Box>
                                        </Card>
                                    </div>
                                }
                            >
                                {(resolvedForms) => (
                                    <FormConfigDataView
                                        forms={resolvedForms}
                                        themeEditorUrl={themeEditorUrl}
                                        navigate={navigate}
                                        onCopyFormId={handleCopyFormId}
                                        onDeleteClick={handleDeleteClick}
                                        onCloneForm={handleCloneForm}
                                        onOpenCreate={() => setCreateModalOpen(true)}
                                    />
                                )}
                            </Await>
                        </Suspense>
                    </Layout.Section>
                </Layout>
            </Page>
        </>
    );
}
