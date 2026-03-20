import type { ActionFunctionArgs } from "react-router";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { Buffer } from "node:buffer";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { saveRegistration, checkEmailExists, checkPhoneExists, approveCustomer } from "../models/approval.server";
import { uploadFileToSupabase } from "../lib/supabase.server";
import { sendApprovalEmail } from "../lib/approval-email.server";
import { getShopDisplayName, parseShopFromGraphqlResponse } from "../lib/liquid-placeholders";

function getEncryptionKey(): Buffer {
    const secret = process.env.SHOPIFY_API_SECRET || "fallback-secret-key";
    return scryptSync(secret, "b2b-pwd-salt", 32);
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
        const email = formData.get("email") as string;
        const firstName = formData.get("firstName") as string;
        const lastName = formData.get("lastName") as string;
        const password = formData.get("password") as string;
        const phone = formData.get("phone") as string || "";
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
                // Check if this is a file upload field (JSON with base64 data — single object or array)
                let isFileField = false;
                if (value.startsWith("{") || value.startsWith("[")) {
                    try {
                        const parsed = JSON.parse(value);
                        const files = Array.isArray(parsed) ? parsed : [parsed];
                        let hasValidFile = false;
                        const processedFiles = [];

                        for (const file of files as Array<{ name?: string; type?: string; size?: number; data?: string }>) {
                            if (file && file.data != null && file.type && file.size != null) {
                                hasValidFile = true;
                                if (!ALLOWED_MIME.includes(file.type)) {
                                    return new Response(JSON.stringify({
                                        error: `Invalid file type for "${file.name || key}". Only JPG, PNG, and PDF are allowed.`
                                    }), {
                                        status: 400,
                                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                                    });
                                }
                                if (file.size > MAX_FILE_SIZE) {
                                    return new Response(JSON.stringify({
                                        error: `File "${file.name || key}" exceeds the 25 MB size limit.`
                                    }), {
                                        status: 400,
                                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                                    });
                                }

                                // Upload to Supabase
                                const base64Data = file.data.includes(",") ? file.data.split(",")[1] : file.data;
                                const buffer = Buffer.from(base64Data, "base64");
                                const uploadResult = await uploadFileToSupabase(buffer, file.name || "upload", file.type);
                                
                                if (uploadResult.error || !uploadResult.url) {
                                    console.error("File upload failed:", uploadResult.error);
                                    return new Response(JSON.stringify({
                                        error: `Failed to upload file "${file.name || key}". Please try again.`
                                    }), {
                                        status: 400,
                                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                                    });
                                }

                                processedFiles.push({
                                    name: file.name,
                                    type: file.type,
                                    size: file.size,
                                    url: uploadResult.url // Store URL instead of base64
                                });
                            }
                        }

                        if (hasValidFile) {
                            isFileField = true;
                            customFields[key] = JSON.stringify(Array.isArray(parsed) ? processedFiles : processedFiles[0]);
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

        // Validate required fields
        if (!email || !firstName || !lastName || !password) {
            return new Response(JSON.stringify({
                error: "Missing required fields",
                required: ["email", "firstName", "lastName", "password"]
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

        // Check if email already exists in DB or Shopify
        const emailExists = await checkEmailExists(shop, email, admin);
        if (emailExists) {
            return new Response(JSON.stringify({
                error: "This email is already registered. Please use a different email or log in."
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // Check if phone already exists in DB or Shopify (avoid duplicate on register)
        const phoneTrimmed = (phone && typeof phone === "string") ? phone.trim() : "";
        if (phoneTrimmed) {
            const phoneExists = await checkPhoneExists(shop, phoneTrimmed, admin);
            if (phoneExists) {
                return new Response(JSON.stringify({
                    error: "This phone number is already registered. Please use a different number."
                }), {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            }
        }

        const mergedCustomData: Record<string, string> = { ...customFields };
        if (address) mergedCustomData.address = address;
        if (city) mergedCustomData.city = city;
        if (state) mergedCustomData.state = state;
        if (zipCode) mergedCustomData.zipCode = zipCode;
        if (country) mergedCustomData.country = country;
        if (language) mergedCustomData.language = language;

        // Save registration to database; if auto-approval is on, create customer in Shopify immediately
        const registration = await saveRegistration(shop, {
            email,
            firstName,
            lastName,
            phone: phone || undefined,
            note: customFieldsNote,
            company: company || undefined,
            passwordHash: encryptPassword(password),
            customData: Object.keys(mergedCustomData).length > 0 ? mergedCustomData : undefined,
        });

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

        let approvalMode: "manual" | "auto" = "manual";
        let afterSubmit: "redirect" | "message" = "message";
        let redirectUrl = "";
        let successMessage = "Registration successful! Your account is pending approval. You will receive an email once approved.";
        try {
            const settings = await prisma.appSettings.findUnique({ where: { shop } });
            const cas = (settings as { customerApprovalSettings?: unknown })?.customerApprovalSettings;
            if (cas && typeof cas === "object" && !Array.isArray(cas)) {
                const o = cas as Record<string, unknown>;
                approvalMode = o.approvalMode === "auto" ? "auto" : "manual";
                afterSubmit = o.afterSubmit === "redirect" ? "redirect" : "message";
                redirectUrl = typeof o.redirectUrl === "string" ? o.redirectUrl : "";
                if (typeof o.successMessage === "string" && o.successMessage.trim()) {
                    successMessage = o.successMessage.trim();
                }
            }
        } catch {
            // keep defaults
        }

        if (approvalMode === "auto") {
            try {
                const { activationUrl } = await approveCustomer(admin!, "db-" + registration.id, shop, session?.accessToken ?? "");
                let shopName = "Store";
                let shopEmail = "";
                try {
                    const shopRes = await admin!.graphql(`#graphql query { shop { name contactEmail } }`);
                    const parsed = await parseShopFromGraphqlResponse(shopRes);
                    shopName = parsed.shopName;
                    shopEmail = parsed.shopEmail;
                } catch { /* use defaults */ }
                shopName = getShopDisplayName(shop, shopName);
                if (email?.trim()) {
                    await sendApprovalEmail(shop, email.trim(), {
                        shopName,
                        shopEmail,
                        customerFirstName: firstName?.trim() || "Customer",
                        activationUrl: activationUrl ?? undefined,
                    });
                }
            } catch (e) {
                console.error("Auto-approval failed:", e);
                return new Response(JSON.stringify({
                    success: false,
                    error: "Registration saved but automatic approval failed. An admin will review your account shortly.",
                    registrationId: registration.id,
                }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            }
            successMessage = "Thank you for registering! Your account is ready. You can log in now.";
        }

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
