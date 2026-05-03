import type { ActionFunctionArgs } from "react-router";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { Buffer } from "node:buffer";
import { authenticate } from "../shopify.server";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import {
    saveRegistration,
    checkEmailExists,
    checkPhoneExists,
    approveCustomer,
    verifyShopifyCustomerOwnsEmail,
    findShopifyCustomerGidByEmailIfUnique,
    addPendingStatusTagToShopifyCustomer,
    getOfflineAccessTokenForShop,
    reconcilePendingRegistrationRow,
    shopifyCustomerHasAnyConfiguredApprovalTag,
} from "../models/approval.server";
import { uploadFileToSupabase } from "../lib/supabase.server";
import { sendApprovalEmail } from "../lib/approval-email.server";
import { getShopNameAndEmail } from "../lib/shop-meta.server";
import { sanitizeRegistrationRedirectForResponse } from "../lib/safe-registration-redirect";
import { normalizeRegistrationPhone, validateStoredRegistrationPhone } from "../lib/registration-phone";

type CoreFieldRequirements = {
    firstName: boolean;
    lastName: boolean;
    email: boolean;
    phone: boolean;
    /** True when a storefront-enabled password field is required. */
    password: boolean;
};

function normalizeFieldType(value: unknown): string {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function fieldStorefrontEnabled(raw: unknown): boolean {
    if (raw === false || raw === 0) return false;
    if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        if (s === "false" || s === "0" || s === "off" || s === "no") return false;
    }
    return true;
}

function getCoreFieldRequirementsFromConfig(fields: unknown): CoreFieldRequirements {
    const req: CoreFieldRequirements = {
        firstName: true,
        lastName: true,
        email: true,
        phone: false,
        password: false,
    };
    if (!Array.isArray(fields) || fields.length === 0) return req;

    const byType = new Map<string, { required: boolean; enabled: boolean }>();
    for (const field of fields) {
        if (!field || typeof field !== "object") continue;
        const obj = field as Record<string, unknown>;
        const type = normalizeFieldType(obj.type);
        if (!type) continue;
        byType.set(type, {
            required: obj.required === true,
            // Match storefront: if a password field exists in the form config, it is shown and submitted.
            enabled: type === "password" ? true : fieldStorefrontEnabled(obj.enabled),
        });
    }

    const resolveRequired = (types: string[], fallback: boolean): boolean => {
        for (const t of types) {
            const field = byType.get(t);
            if (!field) continue;
            return field.enabled && field.required;
        }
        return fallback;
    };

    req.firstName = resolveRequired(["first_name", "firstname"], true);
    req.lastName = resolveRequired(["last_name", "lastname"], true);
    req.email = resolveRequired(["email"], true);
    req.phone = resolveRequired(["phone"], false);
    req.password = resolveRequired(["password"], false);
    return req;
}

function buildGeneratedRegistrationEmail(shop: string): string {
    const shopPart = String(shop || "store")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32) || "store";
    const stamp = Date.now().toString(36);
    const rand = randomBytes(4).toString("hex");
    return `no-email+${shopPart}-${stamp}-${rand}@approvefy.local`;
}

let cachedRegEncryptionKey: Buffer | null = null;
let cachedRegEncryptionSecret: string | null = null;

function getEncryptionKey(): Buffer {
    const secret = process.env.SHOPIFY_API_SECRET || "fallback-secret-key";
    if (cachedRegEncryptionKey && cachedRegEncryptionSecret === secret) {
        return cachedRegEncryptionKey;
    }
    cachedRegEncryptionSecret = secret;
    cachedRegEncryptionKey = scryptSync(secret, "b2b-pwd-salt", 32);
    return cachedRegEncryptionKey;
}

function encryptPassword(password: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
    let encrypted = cipher.update(password, "utf-8", "hex");
    encrypted += cipher.final("hex");
    return `enc:${iv.toString("hex")}:${encrypted}`;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        // Use appProxy auth - validates request came from Shopify proxy
        const { admin, session } = await authenticate.public.appProxy(request);

        if (!admin) {
            return new Response(
                JSON.stringify({ error: "App not installed on this store" }),
                {
                    status: 403,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                }
            );
        }

        const shop = session?.shop || "";
        const formData = await request.formData();

        // Extract customer data
        const emailRaw = formData.get("email");
        const firstNameRaw = formData.get("firstName");
        const lastNameRaw = formData.get("lastName");
        const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
        const firstName = typeof firstNameRaw === "string" ? firstNameRaw.trim() : "";
        const lastName = typeof lastNameRaw === "string" ? lastNameRaw.trim() : "";
        const passwordRaw = formData.get("password");
        const password = typeof passwordRaw === "string" ? passwordRaw.trim() : "";
        const phone = normalizeRegistrationPhone((formData.get("phone") as string) || "");
        const company = formData.get("company") as string || "";
        const address = (formData.get("address") as string) || "";
        const city = (formData.get("city") as string) || "";
        const state = (formData.get("state") as string) || "";
        const zipCode = (formData.get("zipCode") as string) || "";
        const country = (formData.get("country") as string) || "";
        const language = (formData.get("language") as string) || "";

        const MAX_FILE_SIZE = 25 * 1024 * 1024;
        const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];

        // Extract custom fields from Form Builder (custom_*)
        const customFields: Record<string, string> = {};
        const seenKeys = new Set<string>();
        type ParsedFile = { name?: string; type?: string; size?: number; data?: string };
        type FileFieldUpload = { key: string; isArray: boolean; files: ParsedFile[] };
        const fileFieldsToUpload: FileFieldUpload[] = [];

        for (const [key] of formData.entries()) {
            if (typeof key === "string" && key.startsWith("custom_") && !seenKeys.has(key)) {
                seenKeys.add(key);
                const allValues = formData.getAll(key);
                const values = allValues.filter((v): v is string => typeof v === "string");
                let value: string;
                if (values.length > 1) {
                    value = JSON.stringify(values);
                } else if (values.length === 1) {
                    value = values[0];
                } else {
                    continue;
                }
                let isFileField = false;
                if (value.startsWith("{") || value.startsWith("[")) {
                    try {
                        const parsed = JSON.parse(value);
                        const items = (Array.isArray(parsed) ? parsed : [parsed]) as ParsedFile[];
                        const fileItems = items.filter(
                            (f) => f && f.data != null && f.type && f.size != null
                        );
                        if (fileItems.length > 0) {
                            // Validate up-front so we fail fast before kicking off uploads.
                            for (const file of fileItems) {
                                if (!ALLOWED_MIME.includes(file.type!)) {
                                    return new Response(JSON.stringify({
                                        error: `Invalid file type for "${file.name || key}". Only JPG, PNG, and PDF are allowed.`
                                    }), {
                                        status: 400,
                                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                                    });
                                }
                                if ((file.size ?? 0) > MAX_FILE_SIZE) {
                                    return new Response(JSON.stringify({
                                        error: `File "${file.name || key}" exceeds the 25 MB size limit.`
                                    }), {
                                        status: 400,
                                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                                    });
                                }
                            }
                            fileFieldsToUpload.push({
                                key,
                                isArray: Array.isArray(parsed),
                                files: fileItems,
                            });
                            isFileField = true;
                        }
                    } catch {
                        // Not JSON — treat as regular string
                    }
                }

                if (!isFileField) {
                    // Store original value in customData
                    customFields[key] = value;
                }
            }
        }

        if (fileFieldsToUpload.length > 0) {
            // Upload every file from every field in parallel — Supabase storage requests are
            // independent, and waiting for them sequentially was the dominant cost on submits
            // with multiple file fields (each upload was ~200–800 ms).
            const flat = fileFieldsToUpload.flatMap((field) =>
                field.files.map((file) => ({ field, file }))
            );
            const uploads = await Promise.all(
                flat.map(async ({ file }) => {
                    const base64Data = file.data!.includes(",")
                        ? file.data!.split(",")[1]
                        : file.data!;
                    const buffer = Buffer.from(base64Data, "base64");
                    return uploadFileToSupabase(buffer, file.name || "upload", file.type!);
                })
            );

            let cursor = 0;
            for (const field of fileFieldsToUpload) {
                const processed: Array<{ name?: string; type?: string; size?: number; url: string }> = [];
                for (let i = 0; i < field.files.length; i += 1) {
                    const file = field.files[i];
                    const result = uploads[cursor];
                    cursor += 1;
                    if (result.error || !result.url) {
                        console.error("File upload failed:", result.error);
                        return new Response(JSON.stringify({
                            error: `Failed to upload file "${file.name || field.key}". Please try again.`
                        }), {
                            status: 400,
                            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                        });
                    }
                    processed.push({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        url: result.url,
                    });
                }
                customFields[field.key] = JSON.stringify(field.isArray ? processed : processed[0]);
            }
        }

        const hasAddress = address || city || state || zipCode || country || language;
        const customFieldsNote =
            Object.keys(customFields).length > 0 || hasAddress || language
                ? JSON.stringify({
                    company: company || undefined,
                    address: address || undefined,
                    city: city || undefined,
                    state: state || undefined,
                    zipCode: zipCode || undefined,
                    country: country || undefined,
                    language: language || undefined,
                    ...customFields,
                })
                : company
                  ? `Company: ${company}`
                  : undefined;

        // Single composite-ordered FormConfig lookup ("default first, else oldest")
        // halves the latency added before validation can run.
        const formConfig = (await prisma.formConfig.findFirst({
            where: { shop },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            select: { fields: true },
        } as never)) as { fields?: unknown } | null;
        const coreReq = getCoreFieldRequirementsFromConfig(formConfig?.fields);
        const missingRequired: string[] = [];
        if (coreReq.email && !email) missingRequired.push("email");
        if (coreReq.firstName && !firstName) missingRequired.push("firstName");
        if (coreReq.lastName && !lastName) missingRequired.push("lastName");
        if (coreReq.phone && !phone) missingRequired.push("phone");
        if (coreReq.password && !password) missingRequired.push("password");

        if (coreReq.password && password.length > 0 && password.length < 8) {
            return new Response(JSON.stringify({ error: "Password must be at least 8 characters." }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            });
        }

        // Validate required core fields from storefront form config.
        if (missingRequired.length > 0) {
            return new Response(JSON.stringify({
                error: "Missing required fields",
                required: missingRequired,
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // When any address field is filled, country is required
        const hasAnyAddressField = [address, city, state, zipCode].some((v) => typeof v === "string" && v.trim() !== "");
        const countryTrimmed = typeof country === "string" ? country.trim() : "";
        if (hasAnyAddressField && !countryTrimmed) {
            return new Response(JSON.stringify({
                error: "Country is required when address is provided. Please select or enter your country."
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        const hasUserEmail = !!email;
        const persistedEmail = hasUserEmail ? email : buildGeneratedRegistrationEmail(shop);

        const loggedInIdRaw = formData.get("loggedInShopifyCustomerId");
        const loggedInIdStr = typeof loggedInIdRaw === "string" ? loggedInIdRaw.trim() : "";
        // Only trust duplicate exemptions when the storefront proved the logged-in customer owns this email.
        // Inferred / Admin lookup GIDs must not count: otherwise a guest can "match" an approved account and resubmit as success.
        let verifiedShopifyOwnerGid: string | null = null;
        if (loggedInIdStr && hasUserEmail) {
            verifiedShopifyOwnerGid = await verifyShopifyCustomerOwnsEmail(admin, loggedInIdStr, email);
        }
        let linkedCustomerGid: string | null = verifiedShopifyOwnerGid;
        if (!linkedCustomerGid && hasUserEmail) {
            linkedCustomerGid = await findShopifyCustomerGidByEmailIfUnique(admin, email);
        }
        // Fetch status alongside id/customerId so we don't re-query the same rows below.
        const existingRows = hasUserEmail
            ? await prisma.registration.findMany({
                  where: { shop, email: { equals: email, mode: "insensitive" } },
                  orderBy: { updatedAt: "desc" },
                  select: { id: true, customerId: true, status: true },
              })
            : [];
        const existingOwners = Array.from(
            new Set(existingRows.map((r) => (r.customerId || "").trim()).filter(Boolean))
        );
        const inferredOwnerGid: string | null =
            !linkedCustomerGid && existingOwners.length === 1 ? existingOwners[0] : null;
        const ownerForWrite = linkedCustomerGid || inferredOwnerGid;

        // True conflict: another account’s registrations or multiple Shopify customers for this email
        if (hasUserEmail) {
            const emailExists = await checkEmailExists(shop, email, admin, {
                owningCustomerGid: verifiedShopifyOwnerGid,
            });
            if (emailExists) {
                // Guest (no verified Shopify owner on this submit): pending-only duplicate → friendly copy, not "email taken"
                if (!verifiedShopifyOwnerGid) {
                    // Reuse the rows we already fetched above instead of running an identical query.
                    const statusRows = existingRows;
                    if (statusRows.length > 0) {
                        const hasApproved = statusRows.some(
                            (r) => String(r.status || "").toLowerCase() === "approved",
                        );
                        const allPending = statusRows.every(
                            (r) => String(r.status || "pending").toLowerCase() === "pending",
                        );
                        const hasDenied = statusRows.some(
                            (r) => String(r.status || "").toLowerCase() === "denied",
                        );
                        if (!hasApproved && allPending) {
                            return new Response(JSON.stringify({ error: "email_already_pending_registration" }), {
                                status: 400,
                                headers: {
                                    "Content-Type": "application/json",
                                    "Access-Control-Allow-Origin": "*",
                                },
                            });
                        }
                        if (!hasApproved && hasDenied) {
                            return new Response(JSON.stringify({ error: "email_registration_rejected" }), {
                                status: 400,
                                headers: {
                                    "Content-Type": "application/json",
                                    "Access-Control-Allow-Origin": "*",
                                },
                            });
                        }
                        if (hasApproved) {
                            const approvedWithCustomer = await prisma.registration.findFirst({
                                where: {
                                    shop,
                                    email: { equals: email, mode: "insensitive" },
                                    status: "approved",
                                    customerId: { not: null },
                                },
                                orderBy: { updatedAt: "desc" },
                                select: { customerId: true },
                            });
                            const approvedGid = approvedWithCustomer?.customerId?.trim() ?? "";
                            if (
                                approvedGid.startsWith("gid://shopify/Customer/") &&
                                admin
                            ) {
                                const hasApprovalTags = await shopifyCustomerHasAnyConfiguredApprovalTag(
                                    admin,
                                    approvedGid,
                                    shop,
                                );
                                if (hasApprovalTags === false) {
                                    return new Response(
                                        JSON.stringify({ error: "email_approval_removed_contact_support" }),
                                        {
                                            status: 400,
                                            headers: {
                                                "Content-Type": "application/json",
                                                "Access-Control-Allow-Origin": "*",
                                            },
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
                return new Response(
                    JSON.stringify({
                        error: "email_already_registered",
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    }
                );
            }
        }

        const phoneValidationError = validateStoredRegistrationPhone(phone);
        if (phoneValidationError) {
            return new Response(JSON.stringify({ error: phoneValidationError }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }
        if (phone) {
            const phoneExists = await checkPhoneExists(shop, phone, admin, {
                owningCustomerGid: verifiedShopifyOwnerGid,
            });
            if (phoneExists) {
                return new Response(
                    JSON.stringify({
                        error: "Unable to save your application. Please contact the store for help.",
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    }
                );
            }
        }

        const mergedCustomData: Record<string, string> = { ...customFields };
        if (address) mergedCustomData.address = address;
        if (city) mergedCustomData.city = city;
        if (state) mergedCustomData.state = state;
        if (zipCode) mergedCustomData.zipCode = zipCode;
        if (country) mergedCustomData.country = country;
        if (language) mergedCustomData.language = language;

        const companyTrimmed = typeof company === "string" ? company.trim() : "";

        // Save or update registration (logged-in Shopify customer re-applying: update pending row + link customerId for tag-only approval)
        let registration: Awaited<ReturnType<typeof saveRegistration>> = null;
        if (ownerForWrite) {
            const existingRow = await prisma.registration.findFirst({
                where: {
                    shop,
                    email: { equals: persistedEmail, mode: "insensitive" },
                    OR: [{ customerId: null }, { customerId: ownerForWrite }],
                },
                orderBy: { updatedAt: "desc" },
                select: { id: true, customerId: true },
            });
            if (existingRow) {
                const ecid = existingRow.customerId?.trim() || null;
                if (ecid && ecid !== ownerForWrite) {
                    return new Response(
                        JSON.stringify({
                            error: "Unable to save your application. Please contact the store for help.",
                        }),
                        {
                            status: 400,
                            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                        }
                    );
                }
                try {
                    registration = await prisma.registration.update({
                        where: { id: existingRow.id },
                        data: {
                            status: "pending",
                            reviewedAt: null,
                            reviewedBy: null,
                            firstName,
                            lastName,
                            phone: phone || null,
                            company: companyTrimmed || null,
                            ...(password ? { passwordHash: encryptPassword(password) } : {}),
                            customData:
                                Object.keys(mergedCustomData).length > 0
                                    ? (mergedCustomData as Prisma.InputJsonValue)
                                    : Prisma.JsonNull,
                            note: customFieldsNote ?? null,
                            customerId: ownerForWrite,
                        },
                    });
                } catch (updErr) {
                    console.error("Update registration (override) failed:", updErr);
                    registration = null;
                }
            }
        }
        if (!registration) {
            const orphan = await prisma.registration.findFirst({
                where: {
                    shop,
                    email: { equals: persistedEmail, mode: "insensitive" },
                    customerId: null,
                    status: { in: ["pending", "denied", "approved"] },
                },
                orderBy: { updatedAt: "desc" },
                select: { id: true },
            });
            if (orphan) {
                try {
                    registration = await prisma.registration.update({
                        where: { id: orphan.id },
                        data: {
                            status: "pending",
                            reviewedAt: null,
                            reviewedBy: null,
                            firstName,
                            lastName,
                            phone: phone || null,
                            company: companyTrimmed || null,
                            ...(password ? { passwordHash: encryptPassword(password) } : {}),
                            customData:
                                Object.keys(mergedCustomData).length > 0
                                    ? (mergedCustomData as Prisma.InputJsonValue)
                                    : Prisma.JsonNull,
                            note: customFieldsNote ?? null,
                            customerId: ownerForWrite,
                        },
                    });
                } catch (orphErr) {
                    console.error("Orphan registration merge failed:", orphErr);
                    registration = null;
                }
            }
        }
        if (!registration && existingRows.length > 0) {
            try {
                const fallbackRow = existingRows.find((r) => {
                    const cid = (r.customerId || "").trim();
                    if (!cid) return true;
                    return !!ownerForWrite && cid === ownerForWrite;
                });
                if (fallbackRow) {
                    registration = await prisma.registration.update({
                        where: { id: fallbackRow.id },
                        data: {
                            status: "pending",
                            reviewedAt: null,
                            reviewedBy: null,
                            firstName,
                            lastName,
                            phone: phone || null,
                            company: companyTrimmed || null,
                            ...(password ? { passwordHash: encryptPassword(password) } : {}),
                            customData:
                                Object.keys(mergedCustomData).length > 0
                                    ? (mergedCustomData as Prisma.InputJsonValue)
                                    : Prisma.JsonNull,
                            note: customFieldsNote ?? null,
                            customerId: ownerForWrite,
                        },
                    });
                }
            } catch (fallbackErr) {
                console.error("Fallback registration override failed:", fallbackErr);
                registration = null;
            }
        }
        if (!registration) {
            registration = await saveRegistration(shop, {
                email: persistedEmail,
                firstName,
                lastName,
                phone: phone || undefined,
                note: customFieldsNote,
                company: companyTrimmed || undefined,
                passwordHash: password ? encryptPassword(password) : undefined,
                customData: Object.keys(mergedCustomData).length > 0 ? mergedCustomData : undefined,
                customerId: ownerForWrite || undefined,
            });
        }

        if (!registration) {
            return new Response(JSON.stringify({
                error: "Failed to save registration. Please try again."
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        if (ownerForWrite) {
            // Fire-and-forget: tagging the customer "status:pending" is non-essential for the
            // submit response (DB row already saved). Awaiting it added an Admin-API roundtrip
            // (~200–600 ms) on every submit. Errors are still logged inside the helper.
            void addPendingStatusTagToShopifyCustomer(admin, ownerForWrite).catch((e) => {
                console.warn("[api.register] background tagsAdd status:pending failed:", e);
            });
        }

        let approvalMode: "manual" | "auto" = "manual";
        let afterSubmit: "redirect" | "message" = "message";
        let redirectUrl = "";
        let successMessage = "Registration successful! Your account is pending approval. You will receive an email once approved.";
        try {
            const settings = await prisma.appSettings.findUnique({ where: { shop } });
            const cas = (settings as { customerApprovalSettings?: unknown })?.customerApprovalSettings;
            if (cas && typeof cas === "object" && !Array.isArray(cas)) {
                const o = cas as Record<string, unknown>;
                const modeRaw = String(o.approvalMode ?? "")
                    .trim()
                    .toLowerCase();
                approvalMode = modeRaw === "auto" ? "auto" : "manual";
                afterSubmit = o.afterSubmit === "redirect" ? "redirect" : "message";
                redirectUrl = typeof o.redirectUrl === "string" ? o.redirectUrl : "";
                if (typeof o.successMessage === "string" && o.successMessage.trim()) {
                    successMessage = o.successMessage.trim();
                }
            }
        } catch {
            // keep defaults
        }

        if (approvalMode === "auto" && !hasUserEmail) {
            approvalMode = "manual";
        }

        if (approvalMode === "auto") {
            let activationUrl: string | null | undefined;
            const shopAccessToken =
                (session && typeof session.accessToken === "string" && session.accessToken.trim()) ||
                (await getOfflineAccessTokenForShop(shop)) ||
                "";
            if (!shopAccessToken) {
                console.warn(
                    "[api.register] Auto-approval: no Admin access token (app proxy session + offline Session lookup empty). REST customer create may fall back to GraphQL only.",
                );
            }
            try {
                const approved = await approveCustomer(
                    admin!,
                    "db-" + registration.id,
                    shop,
                    shopAccessToken,
                );
                activationUrl = approved.activationUrl;
            } catch (e) {
                console.error("Auto-approval failed:", e);
                let repaired = await reconcilePendingRegistrationRow(
                    admin!,
                    shop,
                    registration.id,
                    persistedEmail,
                    shopAccessToken,
                );
                if (!repaired) {
                    const row = await prisma.registration.findUnique({
                        where: { id: registration.id },
                        select: { status: true },
                    });
                    if ((row?.status || "").toLowerCase() === "approved") {
                        repaired = true;
                    }
                }
                if (!repaired) {
                    // Data is saved; only instant approval failed — treat as success so the storefront shows the green message under the submit button.
                    const safeRedirect = sanitizeRegistrationRedirectForResponse(afterSubmit, redirectUrl);
                    const msg =
                        successMessage.trim() ||
                        "Thank you! Your registration was submitted. An admin will review your account shortly.";
                    return new Response(
                        JSON.stringify({
                            success: true,
                            message: msg,
                            registrationId: registration.id,
                            afterSubmit: safeRedirect.afterSubmit,
                            redirectUrl:
                                safeRedirect.afterSubmit === "redirect"
                                    ? safeRedirect.redirectUrl
                                    : undefined,
                            successMessage:
                                safeRedirect.afterSubmit === "message" ? msg : undefined,
                        }),
                        {
                            status: 200,
                            headers: {
                                "Content-Type": "application/json",
                                "Access-Control-Allow-Origin": "*",
                            },
                        },
                    );
                }
                console.warn(
                    "[api.register] Auto-approval reconciled after error: registration marked approved.",
                );
            }
            // If approveCustomer returned without throwing but the row stayed pending, try full reconcile once
            // (email + linked customer with approved tag).
            {
                const latest = await prisma.registration.findUnique({
                    where: { id: registration.id },
                    select: { status: true },
                });
                if (latest?.status === "pending") {
                    const repairedAfter = await reconcilePendingRegistrationRow(
                        admin!,
                        shop,
                        registration.id,
                        persistedEmail,
                        shopAccessToken,
                    );
                    if (repairedAfter) {
                        console.warn(
                            "[api.register] Auto-approval: DB was still pending after approveCustomer; reconciled from Shopify.",
                        );
                    }
                }
            }
            // Approval email is best-effort — SMTP/template errors must not undo a successful Shopify approval.
            if (hasUserEmail && email?.trim()) {
                try {
                    const { shopName, shopEmail } = await getShopNameAndEmail(admin, shop);
                    await sendApprovalEmail(shop, email.trim(), {
                        shopName,
                        shopEmail,
                        customerFirstName: firstName?.trim() || "Customer",
                        activationUrl: activationUrl ?? undefined,
                    });
                } catch (emailErr) {
                    console.error("Auto-approval: customer approved but approval email failed (non-fatal):", emailErr);
                }
            }
            successMessage =
                "Thank you for registering! Your account is ready. You can log in and start browsing and ordering products.";
        }

        const safeRedirect = sanitizeRegistrationRedirectForResponse(afterSubmit, redirectUrl);
        afterSubmit = safeRedirect.afterSubmit;
        redirectUrl = safeRedirect.redirectUrl;

        return new Response(JSON.stringify({
            success: true,
            message: successMessage,
            registrationId: registration.id,
            afterSubmit,
            redirectUrl: afterSubmit === "redirect" ? redirectUrl : undefined,
            successMessage: afterSubmit === "message" ? successMessage : undefined,
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });

    } catch (error) {
        console.error("Customer registration error:", error);
        return new Response(JSON.stringify({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        }), {
            status: 400,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }
};
