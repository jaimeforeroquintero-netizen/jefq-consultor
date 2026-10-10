#requires -Version 7.0

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Clear-Host

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " JEFQ CONSULTOR - DESPLIEGUE AUTOMATICO VERCEL" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

$Proyecto = "$HOME\Documents\JEFQ-Ciberseguridad"

if (-not (Test-Path $Proyecto)) {
    throw "No existe: $Proyecto"
}

Set-Location $Proyecto

Write-Host "[1/5] Verificando build..." -ForegroundColor Yellow

npm.cmd run build

if ($LASTEXITCODE -ne 0) {
    throw "Build fallido."
}

Write-Host "[OK] Build correcto." -ForegroundColor Green

Write-Host "[2/5] Verificando Vercel CLI..." -ForegroundColor Yellow

$vercel = Get-Command vercel -ErrorAction Stop

Write-Host "[OK] Vercel encontrado: $($vercel.Source)" -ForegroundColor Green

Write-Host "[3/5] Verificando login..." -ForegroundColor Yellow

try {
    vercel whoami
}
catch {
    Write-Host ""
    Write-Host "Debes iniciar sesion en Vercel." -ForegroundColor Yellow
    vercel login
}

Write-Host "[4/5] Desplegando Preview..." -ForegroundColor Yellow

vercel

Write-Host ""
Write-Host "[5/5] Desplegando Produccion..." -ForegroundColor Yellow

vercel --prod

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host " DESPLIEGUE COMPLETADO" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Copia la URL que entregue Vercel." -ForegroundColor Cyan