#requires -Version 7.0
<#
.SYNOPSIS
  Publica JEFQ-Ciberseguridad en GitHub y conecta el repositorio con Vercel.
.DESCRIPTION
  Modo seguro y verificable: comprueba herramientas, crea/actualiza .gitignore,
  audita posibles secretos con progreso y ETA, inicializa Git, autentica GitHub,
  crea o reutiliza un repositorio publico, hace push a main y conecta Vercel.
  Las autenticaciones web de GitHub y Vercel requieren intervencion del usuario.
#>

[CmdletBinding()]
param(
    [string]$ProjectPath = 'C:\Users\Andres Mauricio FQ\Documents\JEFQ-Ciberseguridad',
    [string]$RepoName = 'jefq-consultor',
    [string]$VercelProject = 'jefq-consultor'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'

$Script:StartedAt = Get-Date
$Script:Stage = 0
$Script:StageCount = 10
$Script:LogFile = $null

function Write-Stage {
    param([Parameter(Mandatory)][string]$Name)
    $Script:Stage++
    $percent = [math]::Min(100, [math]::Round(($Script:Stage / $Script:StageCount) * 100))
    $elapsed = (Get-Date) - $Script:StartedAt
    Write-Progress -Id 1 -Activity 'JEFQ GitHub + Vercel' -Status "Etapa $Script:Stage de $Script:StageCount | $Name | Transcurrido $($elapsed.ToString('hh\:mm\:ss'))" -PercentComplete $percent
    Write-Host "`n[$Script:Stage/$Script:StageCount] $Name" -ForegroundColor Cyan
}

function Write-Log {
    param([Parameter(Mandatory)][string]$Message, [string]$Level = 'INFO')
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if ($Script:LogFile) { Add-Content -LiteralPath $Script:LogFile -Value $line -Encoding utf8 }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter()][string[]]$ArgumentList = @(),
        [switch]$AllowFailure
    )
    Write-Log "Ejecutando: $FilePath $($ArgumentList -join ' ')"
    & $FilePath @ArgumentList
    $code = $LASTEXITCODE
    if (($code -ne 0) -and -not $AllowFailure) {
        throw "El comando fallo con codigo $code`: $FilePath $($ArgumentList -join ' ')"
    }
    return $code
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Ensure-WinGetPackage {
    param(
        [Parameter(Mandatory)][string]$CommandName,
        [Parameter(Mandatory)][string]$PackageId,
        [Parameter(Mandatory)][string]$DisplayName
    )
    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        Write-Host "[OK] $DisplayName disponible." -ForegroundColor Green
        return
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "No se encontro WinGet. Instala o repara 'Instalador de aplicaciones' de Microsoft y vuelve a ejecutar el script."
    }
    Write-Host "Instalando $DisplayName con WinGet..." -ForegroundColor Yellow
    Invoke-Native -FilePath 'winget' -ArgumentList @('install','--id',$PackageId,'--exact','--source','winget','--accept-package-agreements','--accept-source-agreements')
    Refresh-Path
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$DisplayName se instalo, pero el comando '$CommandName' aun no esta disponible. Cierra PowerShell, abre PowerShell 7 y ejecuta de nuevo este mismo archivo."
    }
}

function Add-GitIgnoreEntries {
    param([Parameter(Mandatory)][string]$Path)
    $required = @(
        'node_modules/', '.next/', '.env', '.env.*', '*.log',
        'dist/', 'build/', '.vercel/', '_JEFQ_GitHub_Logs/'
    )
    if (Test-Path -LiteralPath $Path) {
        $backup = "$Path.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item -LiteralPath $Path -Destination $backup -Force
        Write-Log "Backup creado: $backup"
        $current = @(Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)
    } else {
        $current = @()
    }
    $missing = @($required | Where-Object { $_ -notin $current })
    if ($missing.Count -gt 0) {
        if ($current.Count -gt 0 -and $current[-1] -ne '') { Add-Content -LiteralPath $Path -Value '' -Encoding utf8 }
        Add-Content -LiteralPath $Path -Value @('# JEFQ: exclusiones de publicacion segura') -Encoding utf8
        Add-Content -LiteralPath $Path -Value $missing -Encoding utf8
    }
    Write-Host '[OK] .gitignore verificado y actualizado.' -ForegroundColor Green
}

function Find-PossibleSecrets {
    param([Parameter(Mandatory)][string]$Root)

    $excluded = '\\(node_modules|\.git|\.next|\.vercel|dist|build|coverage|_JEFQ_GitHub_Logs)(\\|$)'
    $extensions = @('.astro','.js','.jsx','.mjs','.cjs','.ts','.tsx','.json','.md','.txt','.html','.css','.scss','.sass','.less','.yml','.yaml','.toml','.xml','.ps1','.py','.env')
    $namePatterns = @('.env','.env.*')

    Write-Host 'Enumerando archivos de texto; se excluyen carpetas pesadas...' -ForegroundColor DarkCyan
    $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object {
        $_.FullName -notmatch $excluded -and
        $_.Length -le 2MB -and
        (($_.Extension.ToLowerInvariant() -in $extensions) -or ($_.Name -like '.env*'))
    })

    $regexes = [ordered]@{
        'Clave privada' = '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'
        'GitHub token' = '(?i)\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b'
        'Bearer token literal' = '(?i)\bBearer\s+[A-Za-z0-9_\-\.]{20,}'
        'Asignacion sensible' = '(?i)\b(api[_-]?key|secret|token|password|passwd|private[_-]?key)\b\s*[:=]\s*["'']?[^\s"'']{8,}'
    }

    $findings = [System.Collections.Generic.List[object]]::new()
    $total = $files.Count
    $scanStart = Get-Date

    for ($i = 0; $i -lt $total; $i++) {
        $file = $files[$i]
        $done = $i + 1
        $percent = if ($total -gt 0) { [math]::Round(($done / $total) * 100) } else { 100 }
        $elapsed = (Get-Date) - $scanStart
        if ($done -gt 0) {
            $secondsPerFile = $elapsed.TotalSeconds / $done
            $eta = [TimeSpan]::FromSeconds([math]::Max(0, $secondsPerFile * ($total - $done)))
        } else { $eta = [TimeSpan]::Zero }
        Write-Progress -Id 2 -ParentId 1 -Activity 'Auditoria local de secretos' -Status "Archivo $done/$total | $percent% | Transcurrido $($elapsed.ToString('hh\:mm\:ss')) | ETA $($eta.ToString('hh\:mm\:ss'))" -CurrentOperation $file.FullName -PercentComplete $percent
        try {
            $lineNumber = 0
            foreach ($line in [System.IO.File]::ReadLines($file.FullName)) {
                $lineNumber++
                foreach ($entry in $regexes.GetEnumerator()) {
                    if ($line -match $entry.Value) {
                        $findings.Add([pscustomobject]@{
                            Tipo = $entry.Key
                            Archivo = $file.FullName
                            Linea = $lineNumber
                        })
                    }
                }
            }
        } catch {
            Write-Log "No se pudo analizar $($file.FullName): $($_.Exception.Message)" 'WARN'
        }
    }
    Write-Progress -Id 2 -ParentId 1 -Activity 'Auditoria local de secretos' -Completed
    return @($findings | Sort-Object Tipo, Archivo, Linea -Unique)
}

try {
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ' JEFQ - PUBLICACION SEGURA EN GITHUB + CONEXION A VERCEL' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan

    Write-Stage 'Validar proyecto y preparar registro'
    if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
        throw "No existe la carpeta del proyecto: $ProjectPath"
    }
    Set-Location -LiteralPath $ProjectPath
    $logDir = Join-Path $ProjectPath '_JEFQ_GitHub_Logs'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $Script:LogFile = Join-Path $logDir ("Publicacion-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Write-Log "Inicio. Proyecto: $ProjectPath"

    Write-Stage 'Comprobar Git, GitHub CLI y Node.js'
    Ensure-WinGetPackage -CommandName 'git' -PackageId 'Git.Git' -DisplayName 'Git'
    Ensure-WinGetPackage -CommandName 'gh' -PackageId 'GitHub.cli' -DisplayName 'GitHub CLI'
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host '[AVISO] Node.js/npm no esta disponible. La publicacion en GitHub continuara; la conexion automatica con Vercel se omitira.' -ForegroundColor Yellow
        $hasNpm = $false
    } else { $hasNpm = $true }

    Write-Stage 'Crear o completar .gitignore'
    Add-GitIgnoreEntries -Path (Join-Path $ProjectPath '.gitignore')

    Write-Stage 'Auditar posibles secretos antes de publicar'
    $findings = @(Find-PossibleSecrets -Root $ProjectPath)
    $report = Join-Path $logDir ("Secretos-posibles-{0}.csv" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    if ($findings.Count -gt 0) {
        $findings | Export-Csv -LiteralPath $report -NoTypeInformation -Encoding utf8
        Write-Host "`n[ALTO] Se encontraron $($findings.Count) coincidencias que requieren revision:" -ForegroundColor Red
        $findings | Format-Table Tipo, Archivo, Linea -AutoSize
        Write-Host "Informe: $report" -ForegroundColor Yellow
        Write-Host 'El script NO mostrara valores sensibles ni publicara automaticamente sin confirmacion explicita.' -ForegroundColor Yellow
        $confirmation = Read-Host "Si revisaste las coincidencias y son falsas alarmas o valores seguros, escribe exactamente PUBLICAR. Cualquier otra respuesta cancela"
        if ($confirmation -cne 'PUBLICAR') { throw 'Cancelado de forma segura antes de crear o subir el repositorio.' }
    } else {
        'Sin coincidencias en la auditoria heuristica.' | Set-Content -LiteralPath $report -Encoding utf8
        Write-Host '[OK] No se detectaron secretos evidentes mediante la auditoria heuristica.' -ForegroundColor Green
    }

    Write-Stage 'Inicializar y configurar Git'
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath '.git'))) {
        Invoke-Native -FilePath 'git' -ArgumentList @('init')
    }
    Invoke-Native -FilePath 'git' -ArgumentList @('branch','-M','main')
    $gitName = (& git config --get user.name 2>$null)
    $gitEmail = (& git config --get user.email 2>$null)
    if ([string]::IsNullOrWhiteSpace(($gitName -join ''))) {
        $gitNameInput = Read-Host 'Escribe el nombre que quieres usar en los commits de Git'
        if ([string]::IsNullOrWhiteSpace($gitNameInput)) { throw 'El nombre Git no puede quedar vacio.' }
        Invoke-Native -FilePath 'git' -ArgumentList @('config','user.name',$gitNameInput)
    }
    if ([string]::IsNullOrWhiteSpace(($gitEmail -join ''))) {
        $gitEmailInput = Read-Host 'Escribe el correo que quieres usar en los commits de Git'
        if ([string]::IsNullOrWhiteSpace($gitEmailInput)) { throw 'El correo Git no puede quedar vacio.' }
        Invoke-Native -FilePath 'git' -ArgumentList @('config','user.email',$gitEmailInput)
    }

    Write-Stage 'Autenticar GitHub'
    & gh auth status --hostname github.com *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Se abrira el navegador para iniciar sesion en GitHub. Completa la autorizacion y vuelve a esta ventana.' -ForegroundColor Yellow
        Invoke-Native -FilePath 'gh' -ArgumentList @('auth','login','--hostname','github.com','--git-protocol','https','--web')
    }
    $githubUser = (& gh api user --jq '.login').Trim()
    if ([string]::IsNullOrWhiteSpace($githubUser)) { throw 'No fue posible obtener el usuario autenticado de GitHub.' }
    Write-Host "[OK] GitHub autenticado como $githubUser" -ForegroundColor Green

    Write-Stage 'Preparar commit local'
    Invoke-Native -FilePath 'git' -ArgumentList @('add','--all')
    & git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        Invoke-Native -FilePath 'git' -ArgumentList @('commit','-m','Publicacion inicial de JEFQ Consultor')
    } else {
        Write-Host '[OK] No hay cambios nuevos para confirmar.' -ForegroundColor Green
    }

    Write-Stage 'Crear o reutilizar repositorio GitHub y hacer push'
    $remoteUrl = (& git remote get-url origin 2>$null)
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($remoteUrl -join ''))) {
        $remoteUrl = ($remoteUrl -join '').Trim()
        Write-Host "[OK] Ya existe el remoto origin: $remoteUrl" -ForegroundColor Green
        Invoke-Native -FilePath 'git' -ArgumentList @('push','-u','origin','main')
    } else {
        & gh repo view "$githubUser/$RepoName" *> $null
        if ($LASTEXITCODE -eq 0) {
            $remoteUrl = "https://github.com/$githubUser/$RepoName.git"
            Invoke-Native -FilePath 'git' -ArgumentList @('remote','add','origin',$remoteUrl)
            Invoke-Native -FilePath 'git' -ArgumentList @('push','-u','origin','main')
        } else {
            Invoke-Native -FilePath 'gh' -ArgumentList @('repo','create',"$githubUser/$RepoName",'--public','--source','.','--remote','origin','--push')
        }
    }
    $repoWebUrl = (& gh repo view --json url --jq '.url').Trim()
    if ([string]::IsNullOrWhiteSpace($repoWebUrl)) { $repoWebUrl = "https://github.com/$githubUser/$RepoName" }

    Write-Stage 'Instalar o comprobar Vercel CLI'
    $vercelConnected = $false
    if ($hasNpm) {
        if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
            Write-Host 'Instalando Vercel CLI con npm...' -ForegroundColor Yellow
            Invoke-Native -FilePath 'npm' -ArgumentList @('install','--global','vercel@latest')
            Refresh-Path
        }
        if (Get-Command vercel -ErrorAction SilentlyContinue) {
            Write-Stage 'Vincular proyecto y conectar GitHub con Vercel'
            & vercel whoami *> $null
            if ($LASTEXITCODE -ne 0) {
                Write-Host 'Vercel requiere autenticacion. Sigue las instrucciones que aparezcan.' -ForegroundColor Yellow
                Invoke-Native -FilePath 'vercel' -ArgumentList @('login')
            }
            Invoke-Native -FilePath 'vercel' -ArgumentList @('link','--yes','--project',$VercelProject)
            $connectCode = Invoke-Native -FilePath 'vercel' -ArgumentList @('git','connect','--yes') -AllowFailure
            if ($connectCode -eq 0) {
                $vercelConnected = $true
                Write-Host '[OK] Repositorio conectado con el proyecto de Vercel.' -ForegroundColor Green
            } else {
                Write-Host '[AVISO] GitHub quedo publicado, pero Vercel no confirmo la conexion automatica. Revisa Project > Settings > Git.' -ForegroundColor Yellow
            }
        }
    } else {
        $Script:Stage++
    }

    Write-Stage 'Verificacion final y resumen'
    Invoke-Native -FilePath 'git' -ArgumentList @('status','--short','--branch')
    $visibility = (& gh repo view --json visibility --jq '.visibility').Trim()
    Write-Log "Repositorio final: $repoWebUrl | Visibilidad: $visibility | Vercel conectado: $vercelConnected"
    Write-Progress -Id 1 -Activity 'JEFQ GitHub + Vercel' -Completed

    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host ' PROCESO COMPLETADO' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host "Repositorio: $repoWebUrl" -ForegroundColor Cyan
    Write-Host "Visibilidad: $visibility" -ForegroundColor Cyan
    Write-Host "Vercel conectado: $vercelConnected" -ForegroundColor Cyan
    Write-Host "Registro: $Script:LogFile" -ForegroundColor DarkCyan
    Write-Host 'Copia la URL mostrada arriba y pegala en el chat.' -ForegroundColor White
}
catch {
    Write-Progress -Id 1 -Activity 'JEFQ GitHub + Vercel' -Completed
    $message = $_.Exception.Message
    Write-Log $message 'ERROR'
    Write-Host "`n[ERROR] $message" -ForegroundColor Red
    if ($Script:LogFile) { Write-Host "Registro: $Script:LogFile" -ForegroundColor Yellow }
    exit 1
}
