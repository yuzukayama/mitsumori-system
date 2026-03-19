# Cloud Run Deploy Script
# Usage: .\scripts\deploy-cloudrun.ps1

$ErrorActionPreference = "Stop"
$ProjectId = "sgc-mitsumori-system"
$Region = "asia-northeast1"
$ServiceName = "mitsumori-system"

if (-not (Test-Path ".env")) {
    Write-Error ".env file not found"
}

$envVars = @{}
Get-Content ".env" -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $idx = $line.IndexOf("=")
        if ($idx -gt 0) {
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
            if ($key -and $val) { $envVars[$key] = $val }
        }
    }
}

$required = @("DATABASE_URL", "NEXTAUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
foreach ($r in $required) {
    if (-not $envVars[$r]) {
        Write-Error "Required: Set $r in .env"
    }
}

if ($envVars["NEXTAUTH_SECRET"] -eq "dev-secret-change-in-production") {
    Write-Host "WARNING: Use a strong NEXTAUTH_SECRET for production. Run: [Convert]::ToBase64String((1..32|%{Get-Random -Max 256}) -as [byte[]])"
}

Write-Host ""
Write-Host "=== Deploying to Cloud Run ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectId / Region: $Region"
Write-Host ""

$envList = "DATABASE_URL=" + $envVars["DATABASE_URL"] + ",NEXTAUTH_SECRET=" + $envVars["NEXTAUTH_SECRET"] + ",GOOGLE_CLIENT_ID=" + $envVars["GOOGLE_CLIENT_ID"] + ",GOOGLE_CLIENT_SECRET=" + $envVars["GOOGLE_CLIENT_SECRET"]

gcloud run deploy $ServiceName --project $ProjectId --region $Region --source . --allow-unauthenticated --set-env-vars $envList --memory 512Mi --min-instances 0 --max-instances 5

$url = gcloud run services describe $ServiceName --project $ProjectId --region $Region --format="value(status.url)" 2>$null
if ($url) {
    $callbackUrl = $url + "/api/auth/callback/google"
    $envListWithUrl = $envList + ",NEXTAUTH_URL=" + $url
    gcloud run services update $ServiceName --project $ProjectId --region $Region --set-env-vars $envListWithUrl --quiet 2>$null

    Write-Host ""
    Write-Host "=== Deploy Complete ===" -ForegroundColor Green
    Write-Host "URL: $url"
    Write-Host ""
    Write-Host "IMPORTANT: Add redirect URI in Google Cloud Console:" -ForegroundColor Yellow
    Write-Host "1. https://console.cloud.google.com/apis/credentials?project=$ProjectId"
    Write-Host "2. Edit OAuth 2.0 Client ID"
    Write-Host "3. Add to Authorized redirect URIs:"
    Write-Host "   $callbackUrl" -ForegroundColor White
    Write-Host ""
    Write-Host "After adding, login at: $url"
}
