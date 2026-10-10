# =====================================================
# JEFQ - GitHub Auto Publish
# PowerShell 7+
# =====================================================

$ErrorActionPreference = "Stop"

$ProjectPath = "C:\Users\Andres Mauricio FQ\Documents\JEFQ-Ciberseguridad"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " JEFQ GitHub Auto Publish"
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------
# Verificar carpeta proyecto
# -----------------------------------------------------

if (!(Test-Path $ProjectPath)) {
    Write-Host "No existe la carpeta:" -ForegroundColor Red
    Write-Host $ProjectPath
    exit 1
}

Set-Location $ProjectPath

Write-Host "[OK] Proyecto localizado" -ForegroundColor Green

# -----------------------------------------------------
# Verificar Git
# -----------------------------------------------------

Write-Host ""
Write-Host "Verificando Git..."

$GitInstalled = $null

try {
    $GitInstalled = git --version
}
catch {}

if (!$GitInstalled) {

    Write-Host ""
    Write-Host "Git no esta instalado." -ForegroundColor Yellow

    if (Get-Command winget -ErrorAction SilentlyContinue) {

        Write-Host "Instalando Git..." -ForegroundColor Cyan

        winget install `
            --id Git.Git `
            --exact `
            --source winget `
            --accept-package-agreements `
            --accept-source-agreements

        Write-Host ""
        Write-Host "Cierra y vuelve a abrir PowerShell." -ForegroundColor Yellow
        exit
    }
    else {
        Write-Host "Winget no disponible." -ForegroundColor Red
        exit 1
    }
}

Write-Host "[OK] Git detectado" -ForegroundColor Green

# -----------------------------------------------------
# Verificar GitHub CLI
# -----------------------------------------------------

Write-Host ""
Write-Host "Verificando GitHub CLI..."

$GhInstalled = $null

try {
    $GhInstalled = gh --version
}
catch {}

if (!$GhInstalled) {

    Write-Host "GitHub CLI no encontrado." -ForegroundColor Yellow

    if (Get-Command winget -ErrorAction SilentlyContinue) {

        winget install `
            --id GitHub.cli `
            --exact `
            --source winget `
            --accept-package-agreements `
            --accept-source-agreements
    }
    else {
        Write-Host "Winget no disponible." -ForegroundColor Red
        exit 1
    }
}

Write-Host "[OK] GitHub CLI disponible" -ForegroundColor Green

# -----------------------------------------------------
# Crear .gitignore
# -----------------------------------------------------

Write-Host ""
Write-Host "Creando .gitignore..."

@'
node_modules/
.next/
.env
.env.*
*.log
dist/
build/
.vercel
'@ | Set-Content ".gitignore" -Encoding UTF8

Write-Host "[OK] .gitignore generado"

# -----------------------------------------------------
# Auditoria basica de secretos
# -----------------------------------------------------

Write-Host ""
Write-Host "Buscando posibles secretos..."

$Patterns = @(
    "API_KEY",
    "SECRET",
    "TOKEN",
    "PASSWORD",
    "PRIVATE_KEY",
    "BEARER",
    "OPENAI",
    "CLAUDE",
    "GEMINI"
)

$Findings = @()

Get-ChildItem -Recurse -File |
Where-Object {
    $_.FullName -notmatch "node_modules"
} |
ForEach-Object {

    try {

        $Content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue

        foreach ($Pattern in $Patterns) {

            if ($Content -match $Pattern) {

                $Findings += [PSCustomObject]@{
                    Archivo = $_.FullName
                    Coincidencia = $Pattern
                }
            }
        }
    }
    catch {}
}

if ($Findings.Count -gt 0) {

    Write-Host ""
    Write-Host "ATENCION: Posibles secretos encontrados" -ForegroundColor Yellow
    $Findings | Format-Table

    Write-Host ""
    $Continue = Read-Host "Continuar igualmente? (S/N)"

    if ($Continue -ne "S") {
        exit
    }
}
else {
    Write-Host "[OK] No se detectaron secretos evidentes"
}

# -----------------------------------------------------
# Git Init
# -----------------------------------------------------

if (!(Test-Path ".git")) {

    Write-Host ""
    Write-Host "Inicializando repositorio Git..."

    git init

    git branch -M main
}
else {
    Write-Host "[OK] Repositorio Git existente"
}

# -----------------------------------------------------
# Usuario Git
# -----------------------------------------------------

$GitName = git config user.name
$GitEmail = git config user.email

if (:IsNullOrWhiteSpace($GitName)) {

    $GitName = Read-Host "Nombre Git"

    git config user.name "$GitName"
}

if (:IsNullOrWhiteSpace($GitEmail)) {

    $GitEmail = Read-Host "Correo Git"

    git config user.email "$GitEmail"
}

# -----------------------------------------------------
# Commit
# -----------------------------------------------------

Write-Host ""
Write-Host "Creando commit..."

git add .

try {
    git commit -m "Initial commit JEFQ"
}
catch {
    Write-Host "Sin cambios pendientes o commit ya realizado."
}

# -----------------------------------------------------
# Login GitHub
# -----------------------------------------------------

Write-Host ""
Write-Host "Autenticando GitHub..."
Write-Host "Se abrira el navegador."

gh auth status 2>$null

if ($LASTEXITCODE -ne 0) {

    gh auth login `
        --web `
        --git-protocol https
}

# -----------------------------------------------------
# Usuario GitHub
# -----------------------------------------------------

$User = gh api user --jq .login

Write-Host ""
Write-Host "GitHub detectado: $User" -ForegroundColor Green

# -----------------------------------------------------
# Nombre repo
# -----------------------------------------------------

$RepoName = Read-Host "Nombre del repositorio"

if (:IsNullOrWhiteSpace($RepoName)) {
    $RepoName = "jefq-consultor"
}

# -----------------------------------------------------
# Crear repo
# -----------------------------------------------------

Write-Host ""
Write-Host "Creando repositorio publico..."

gh repo create `
    $RepoName `
    --public `
    --source "." `
    --remote origin `
    --push

# -----------------------------------------------------
# URL final
# -----------------------------------------------------

$RepoUrl = "https://github.com/$User/$RepoName"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "REPOSITORIO CREADO"
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host $RepoUrl -ForegroundColor Cyan
Write-Host ""