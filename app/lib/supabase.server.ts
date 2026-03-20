import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

// Make sure these match what you put in your .env
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const bucketName = process.env.SUPABASE_UPLOAD_BUCKET || "b2b-uploads"; // Default bucket name

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

/**
 * Uploads a file buffer to Supabase Storage and returns the public download URL.
 * 
 * @param buffer The file content buffer
 * @param fileName Original filename
 * @param mimeType MIME type of the file
 * @returns The public URL to access the uploaded file
 */
export async function uploadFileToSupabase(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ url: string | null; error: string | null }> {
  if (!supabase) {
    return { url: null, error: "Supabase credentials are not configured in .env (SUPABASE_URL, SUPABASE_ANON_KEY)." };
  }

  try {
    // Generate a unique path to avoid collisions
    const timestamp = Date.now();
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const filePath = `registrations/${timestamp}-${cleanFileName}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return { url: null, error: error.message };
    }

    // Get the public URL for the newly uploaded file
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return { url: publicUrlData.publicUrl, error: null };
  } catch (err) {
    console.error("Error uploading to Supabase:", err);
    return { url: null, error: err instanceof Error ? err.message : "Unknown upload error" };
  }
}

/**
 * Extracts the storage object path from a Supabase public URL.
 * e.g. "https://xxx.supabase.co/storage/v1/object/public/b2b-uploads/registrations/123-file.pdf" -> "registrations/123-file.pdf"
 */
export function getStoragePathFromPublicUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const prefix = `/object/public/${bucketName}/`;
  const idx = url.indexOf(prefix);
  if (idx === -1) return null;
  const path = url.slice(idx + prefix.length).split("?")[0];
  return path && path.length > 0 ? path : null;
}

/**
 * Deletes a single file from Supabase Storage (b2b-uploads bucket).
 */
export async function deleteFileFromSupabase(filePath: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.storage.from(bucketName).remove([filePath]);
    if (error) {
      console.error("Supabase delete error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error deleting from Supabase:", err);
    return false;
  }
}

/**
 * Collects all Supabase file URLs from registration customData (file upload fields)
 * and deletes those files from the b2b-uploads bucket.
 */
export async function deleteSupabaseFilesFromCustomData(
  customData: Record<string, unknown> | null
): Promise<void> {
  if (!customData || !supabase) return;
  const pathsToDelete: string[] = [];
  for (const value of Object.values(customData)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (!value.startsWith("{") && !value.startsWith("[")) continue;
    try {
      const parsed = JSON.parse(value) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object" && "url" in item && typeof (item as { url: string }).url === "string") {
          const url = (item as { url: string }).url;
          const path = getStoragePathFromPublicUrl(url);
          if (path) pathsToDelete.push(path);
        }
      }
    } catch {
      // not file JSON, skip
    }
  }
  if (pathsToDelete.length === 0) return;
  try {
    const { error } = await supabase.storage.from(bucketName).remove(pathsToDelete);
    if (error) console.error("Supabase bulk delete error:", error);
  } catch (err) {
    console.error("Error deleting files from Supabase:", err);
  }
}
