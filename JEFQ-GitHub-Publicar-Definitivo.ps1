[CmdletBinding()]
param(
    [ValidateSet('Audit','Publish')]
    [string]$Mode = 'Publish',
    [string]$ProjectPath = 'C:\Users\Andres Mauricio FQ\Documents\JEFQ-Ciberseguridad',
    [string]$RepoName = 'jefq-consultor',
    [switch]$Private
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'

$ScriptVersion = '1.0.0'
$StartTime = Get-Date
$LogRoot = Join-Path $ProjectPath '.jefq-local-logs'
$LogFile = $null

function Write-Step {
    param([int]$Step,[int]$Total,[string]$Text)
    $percent = [math]::Round(($Step / $Total) * 100)
    $elapsed = (Get-Date) - $StartTime
    Write-Progress -Id 1 -Activity 'JEFQ GitHub Publisher' -Status "Etapa $Step de $Total | $percent% | Transcurrido $($elapsed.ToString('hh\:mm\:ss'))" -CurrentOperation $Text -PercentComplete $percent
    Write-Host "`n[$Step/$Total] $Text" -ForegroundColor Cyan
}

function Invoke-External {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowFailure
    )
    & $FilePath @Arguments
    $code = $LASTEXITCODE
    if (-not $AllowFailure -and $code -ne 0) {
        throw "Fallo el comando: $FilePath $($Arguments -join ' ') (codigo $code)"
    }
    return $code
}

function Add-Log {
    param([string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    $line | Tee-Object -FilePath $LogFile -Append | Out-Host
}

function Test-CommandExists {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-TextFiles {
    param([string]$Root)
    $allowed = @('.astro','.css','.csv','.html','.htm','.js','.jsx','.json','.md','.mjs','.cjs','.ps1','.scss','.ts','.tsx','.txt','.xml','.yaml','.yml','.toml')
    $excluded = '\\(node_modules|\.git|\.astro|\.next|\.vercel|dist|build|coverage|\.backups|\.jefq-backups|\.jefq-control|\.jefq-quarantine|\.jefq-reparaciones|\.jefq-local-logs|logs)(\\|$)'
    return @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object {
        $_.FullName -notmatch $excluded -and
        $_.Extension.ToLowerInvariant() -in $allowed -and
        $_.Length -le 2MB
    })
}

try {
    $TotalSteps = 9

    Write-Step 1 $TotalSteps 'Validando la carpeta del proyecto'
    if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
        throw "No existe la carpeta del proyecto: $ProjectPath"
    }
    Set-Location -LiteralPath $ProjectPath
    New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
    $LogFile = Join-Path $LogRoot ("GitHub-Publish-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Add-Log "Inicio | Version=$ScriptVersion | Mode=$Mode | Project=$ProjectPath"

    Write-Step 2 $TotalSteps 'Validando Git y GitHub CLI'
    foreach ($command in @('git','gh')) {
        if (-not (Test-CommandExists $command)) {
            throw "No se encontro '$command'. En este equipo se esperaba que ya estuviera instalado."
        }
    }
    Add-Log ((git --version) -join ' ')
    Add-Log ((gh --version | Select-Object -First 1) -join ' ')

    Write-Step 3 $TotalSteps 'Creando copia local y actualizando .gitignore'
    $gitIgnorePath = Join-Path $ProjectPath '.gitignore'
    if (Test-Path -LiteralPath $gitIgnorePath) {
        $backup = "$gitIgnorePath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item -LiteralPath $gitIgnorePath -Destination $backup -Force
        Add-Log "Backup de .gitignore: $backup"
    }
    $requiredIgnore = @(
        'node_modules/', '.astro/', '.next/', '.vercel/', 'dist/', 'build/', 'coverage/',
        '.env', '.env.*', '!.env.example', '*.log', '*.zip',
        '.backups/', '.jefq-backups/', '.jefq-control/', '.jefq-quarantine/',
        '.jefq-reparaciones/', '.jefq-local-logs/', 'logs/', 'backups_css/',
        '*.bak', '*.backup-*', 'Nuevo Documento de texto*.txt'
    )
    $existing = if (Test-Path -LiteralPath $gitIgnorePath) { @(Get-Content -LiteralPath $gitIgnorePath -ErrorAction SilentlyContinue) } else { @() }
    $merged = @($existing + $requiredIgnore | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
    $merged | Set-Content -LiteralPath $gitIgnorePath -Encoding utf8
    Add-Log ".gitignore actualizado con exclusiones de secretos, caches, backups y logs."

    Write-Step 4 $TotalSteps 'Auditando posibles secretos con progreso detallado'
    $files = Get-TextFiles -Root $ProjectPath
    $patterns = @(
        '(?i)(api[_-]?key|secret|token|password|passwd|private[_-]?key)\s*[:=]\s*["'']?[^\s"'']{8,}',
        '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
        '(?i)gh[pousr]_[A-Za-z0-9_]{20,}',
        '(?i)(sk|pk)_(live|test)_[A-Za-z0-9]{16,}'
    )
    $findings = [System.Collections.Generic.List[object]]::new()
    $scanStart = Get-Date
    for ($i = 0; $i -lt $files.Count; $i++) {
        $file = $files[$i]
        $done = $i + 1
        $pct = if ($files.Count -eq 0) { 100 } else { [math]::Round(($done / $files.Count) * 100) }
        $elapsed = (Get-Date) - $scanStart
        $eta = [timespan]::Zero
        if ($done -gt 0 -and $files.Count -gt $done) {
            $eta = [timespan]::FromSeconds(($elapsed.TotalSeconds / $done) * ($files.Count - $done))
        }
        Write-Progress -Id 2 -ParentId 1 -Activity 'Auditoria de secretos' -Status "$done de $($files.Count) | $pct% | ETA $($eta.ToString('hh\:mm\:ss'))" -CurrentOperation $file.Name -PercentComplete $pct
        foreach ($pattern in $patterns) {
            $matches = Select-String -LiteralPath $file.FullName -Pattern $pattern -AllMatches -ErrorAction SilentlyContinue
            foreach ($match in $matches) {
                $findings.Add([pscustomobject]@{ Archivo=$file.FullName; Linea=$match.LineNumber; Patron=$pattern })
            }
        }
    }
    Write-Progress -Id 2 -ParentId 1 -Activity 'Auditoria de secretos' -Completed
    if ($findings.Count -gt 0) {
        $report = Join-Path $LogRoot ("Secret-Findings-{0}.csv" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        $findings | Export-Csv -LiteralPath $report -NoTypeInformation -Encoding utf8
        Add-Log "BLOQUEADO: $($findings.Count) posibles secretos. Informe: $report"
        throw "Se detectaron posibles secretos. No se publico nada. Revisa: $report"
    }
    Add-Log "Auditoria completada: $($files.Count) archivos revisados, sin secretos evidentes."

    Write-Step 5 $TotalSteps 'Validando repositorio Git local'
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath '.git'))) {
        Invoke-External git @('init') | Out-Null
    }
    Invoke-External git @('branch','-M','main') | Out-Null
    Add-Log 'Repositorio local preparado en rama main.'

    Write-Step 6 $TotalSteps 'Autenticando GitHub'
    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Se abrira el navegador para autorizar GitHub CLI. Esta es la unica confirmacion externa inevitable.' -ForegroundColor Yellow
        Invoke-External gh @('auth','login','--hostname','github.com','--git-protocol','https','--web') | Out-Null
    }
    Invoke-External gh @('auth','setup-git') | Out-Null
    $login = (& gh api user --jq '.login').Trim()
    if ([string]::IsNullOrWhiteSpace($login)) { throw 'No se pudo obtener el usuario autenticado de GitHub.' }
    Add-Log "GitHub autenticado: $login"

    Write-Step 7 $TotalSteps 'Configurando identidad Git y creando commit'
    $gitName = (& git config user.name).Trim()
    if ([string]::IsNullOrWhiteSpace($gitName)) { Invoke-External git @('config','user.name',$login) | Out-Null }
    $gitEmail = (& git config user.email).Trim()
    if ([string]::IsNullOrWhiteSpace($gitEmail)) { Invoke-External git @('config','user.email',"$login@users.noreply.github.com") | Out-Null }
    Invoke-External git @('add','--all') | Out-Null
    $staged = (& git diff --cached --name-only)
    if (-not $staged) { Add-Log 'No hay cambios nuevos para commit.' }
    else {
        Invoke-External git @('commit','-m','Publicacion inicial de JEFQ Consultor') | Out-Null
        Add-Log "Commit creado con $(@($staged).Count) archivos/rutas."
    }

    if ($Mode -eq 'Audit') {
        Write-Step 8 $TotalSteps 'Modo Audit: omitiendo publicacion'
        Add-Log 'Auditoria finalizada. No se creo ni actualizo ningun repositorio remoto.'
        Write-Step 9 $TotalSteps 'Generando resultado final'
        Write-Progress -Id 1 -Activity 'JEFQ GitHub Publisher' -Completed
        Write-Host "`nAUDITORIA COMPLETADA. Log: $LogFile" -ForegroundColor Green
        exit 0
    }

    Write-Step 8 $TotalSteps 'Creando o reutilizando repositorio y publicando main'
    $visibility = if ($Private) { '--private' } else { '--public' }
    & gh repo view "$login/$RepoName" *> $null
    $repoExists = $LASTEXITCODE -eq 0
    if (-not $repoExists) {
        Invoke-External gh @('repo','create',$RepoName,$visibility,'--source=.','--remote=origin') | Out-Null
        Add-Log "Repositorio creado: $login/$RepoName"
    }
    $expectedRemote = "https://github.com/$login/$RepoName.git"
    $origin = (& git remote get-url origin 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($origin -join ''))) {
        Invoke-External git @('remote','add','origin',$expectedRemote) | Out-Null
    } elseif (($origin -join '').Trim() -ne $expectedRemote) {
        Invoke-External git @('remote','set-url','origin',$expectedRemote) | Out-Null
    }
    Invoke-External git @('push','-u','origin','main') | Out-Null

    Write-Step 9 $TotalSteps 'Verificando publicacion y generando informe'
    $url = (& gh repo view "$login/$RepoName" --json url --jq '.url').Trim()
    $remoteBranch = (& git ls-remote --heads origin main)
    if ([string]::IsNullOrWhiteSpace($url) -or -not $remoteBranch) {
        throw 'El push termino, pero no fue posible verificar la URL o la rama main remota.'
    }
    Add-Log "VERIFICADO | URL=$url | Rama=main"
    Write-Progress -Id 1 -Activity 'JEFQ GitHub Publisher' -Completed
    Write-Host "`nPUBLICACION COMPLETADA Y VERIFICADA" -ForegroundColor Green
    Write-Host "Repositorio: $url" -ForegroundColor Cyan
    Write-Host "Log: $LogFile" -ForegroundColor Gray
}
catch {
    if ($LogFile) { Add-Log "ERROR: $($_.Exception.Message)" }
    Write-Progress -Id 1 -Activity 'JEFQ GitHub Publisher' -Completed
    Write-Host "`nPROCESO DETENIDO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'No se continuara con pasos posteriores.' -ForegroundColor Yellow
    exit 1
}
