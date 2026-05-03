import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function parseCustomerApprovalSettings(input: unknown): Record<string, unknown> {
    if (!input) return {};
    if (typeof input === "string") {
        try {
            const parsed = JSON.parse(input) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    if (typeof input === "object" && !Array.isArray(input)) {
        return input as Record<string, unknown>;
    }
    return {};
}

function buildTemplateSelectionResponse(customerApprovalSettings: unknown) {
    const parsed = parseCustomerApprovalSettings(customerApprovalSettings);
    return {
        rejectionEmailPresetId:
            typeof parsed.rejectionEmailPresetId === "string" ? parsed.rejectionEmailPresetId.trim() : "",
        approvalEmailPresetId:
            typeof parsed.approvalEmailPresetId === "string" ? parsed.approvalEmailPresetId.trim() : "",
    };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop ?? "";
    if (!shop) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const settings = await prisma.appSettings.findUnique({
        where: { shop },
        select: { customerApprovalSettings: true },
    });

    return new Response(JSON.stringify(buildTemplateSelectionResponse(settings?.customerApprovalSettings)), {
        headers: { "Content-Type": "application/json" },
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop ?? "";
    if (!shop) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = (await request.json()) as {
            rejectionEmailPresetId?: unknown;
            approvalEmailPresetId?: unknown;
        };
        const rejectionEmailPresetId =
            typeof body?.rejectionEmailPresetId === "string" ? body.rejectionEmailPresetId.trim() : "";
        const approvalEmailPresetId =
            typeof body?.approvalEmailPresetId === "string" ? body.approvalEmailPresetId.trim() : "";

        const existing = await prisma.appSettings.findUnique({
            where: { shop },
            select: { customerApprovalSettings: true },
        });
        const nextCustomerApprovalSettings = {
            ...parseCustomerApprovalSettings(existing?.customerApprovalSettings),
            rejectionEmailPresetId,
            approvalEmailPresetId,
        };

        await prisma.appSettings.upsert({
            where: { shop },
            create: {
                shop,
                defaultLanguage: "en",
                languageOptions: [],
                customerApprovalSettings: nextCustomerApprovalSettings,
            },
            update: { customerApprovalSettings: nextCustomerApprovalSettings },
        });

        return new Response(
            JSON.stringify({
                rejectionEmailPresetId,
                approvalEmailPresetId,
            }),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to save template selection";
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
