# Test compliance webhook with HMAC (run locally; use your Client Secret from Partner Dashboard)
# Usage: $env:SHOPIFY_API_SECRET = "shpss_xxx"; .\scripts\test-compliance-webhook.ps1

param(
    [string]$Secret = $env:SHOPIFY_API_SECRET,
    [string]$Url = "https://approvefy.xloxi.com/webhooks/compliance"
)

$BODY = '{}'
if (-not $Secret) {
    Write-Host "Set SHOPIFY_API_SECRET: `$env:SHOPIFY_API_SECRET = 'shpss_...'" -ForegroundColor Yellow
    exit 1
}

$HMACBytes = [System.Text.Encoding]::UTF8.GetBytes($BODY)
$KeyBytes = [System.Text.Encoding]::UTF8.GetBytes($Secret)
$hmacsha256 = [System.Security.Cryptography.HMACSHA256]::new()
$hmacsha256.Key = $KeyBytes
$HashBytes = $hmacsha256.ComputeHash($HMACBytes)
$HMAC = [Convert]::ToBase64String($HashBytes)

try {
    $response = Invoke-WebRequest -Uri $Url -Method POST -Body $BODY -ContentType "application/json" `
        -Headers @{
            "X-Shopify-Hmac-SHA256" = $HMAC
            "X-Shopify-Topic"       = "shop/redact"
            "X-Shopify-Shop-Domain" = "test.myshopify.com"
        } -UseBasicParsing
    Write-Host "Status: $($response.StatusCode) (expected 200)" -ForegroundColor Green
} catch {
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
}
