import express from "express";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 3001;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

if (!SHOPIFY_API_SECRET) {
  throw new Error("Missing SHOPIFY_API_SECRET environment variable");
}

// Use raw body for HMAC verification (do not parse JSON first).
app.post("/webhooks/compliance", express.raw({ type: "*/*" }), (req, res) => {
  try {
    const hmacHeader = req.get("x-shopify-hmac-sha256");
    if (!hmacHeader) {
      return res.status(401).json({ error: "Missing signature header" });
    }

    const digest = crypto
      .createHmac("sha256", SHOPIFY_API_SECRET)
      .update(req.body)
      .digest("base64");

    const expectedSignature = Buffer.from(digest, "utf8");
    const receivedSignature = Buffer.from(hmacHeader.trim(), "utf8");

    if (
      expectedSignature.length !== receivedSignature.length ||
      !crypto.timingSafeEqual(expectedSignature, receivedSignature)
    ) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    console.log("Valid compliance webhook received:", {
      topic: req.get("x-shopify-topic"),
      shop: req.get("x-shopify-shop-domain"),
      payload,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook handling failed:", error);
    return res.status(400).json({ error: "Invalid webhook payload" });
  }
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Webhook server listening on http://localhost:${PORT}`);
  console.log("Use HTTPS termination via ngrok/cloudflared in local development.");
});
