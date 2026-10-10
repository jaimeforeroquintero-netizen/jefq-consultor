#requires -Version 7.6
<#+
.SYNOPSIS
  Constructor seguro, reanudable y auditable para la web JEFQ Consultor.
.DESCRIPTION
  Compatible con PowerShell 7.6.6 Core x64 en Windows AMD64.
  Crea backups versionados, bloqueo de concurrencia, estado JSON, logs,
  restauracion, web Astro, SEO, paginas legales, compilacion y servidor local.
#>

[CmdletBinding()]
param(
    [ValidateSet('Rapido','Completo','Reparar')]
    [string]$Modo = 'Rapido',
    [switch]$ForzarDesdeCero,
    [switch]$NoAbrirNavegador,
    [switch]$NoIniciarServidor
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ProjectRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'JEFQ-Ciberseguridad'
$ControlRoot = Join-Path $ProjectRoot '.jefq-control'
$BackupRoot = Join-Path $ProjectRoot '.jefq-backups'
$LogRoot = Join-Path $ProjectRoot 'logs'
$StatePath = Join-Path $ControlRoot 'estado.json'
$LockPath = Join-Path $ControlRoot 'constructor.lock'
$LogPath = Join-Path $LogRoot ("construccion-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$BuildUrl = 'https://jefq-ciber.vercel.app'
$LocalUrl = 'http://localhost:4321/'
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$LockHandle = $null
$CreatedBackup = $null

function Write-Status {
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('INFO','OK','WARN','ERROR','STEP')][string]$Kind = 'INFO'
    )
    $colors = @{ INFO='Gray'; OK='Green'; WARN='Yellow'; ERROR='Red'; STEP='Cyan' }
    $prefix = @{ INFO='[i]'; OK='[OK]'; WARN='[!]'; ERROR='[X]'; STEP='[>>]' }
    $line = "$(Get-Date -Format 'HH:mm:ss') $($prefix[$Kind]) $Message"
    Write-Host $line -ForegroundColor $colors[$Kind]
    if (Test-Path -LiteralPath $LogRoot) { Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8 }
}

function Write-Utf8File {
    param([Parameter(Mandatory)][string]$Path,[Parameter(Mandatory)][AllowEmptyString()][string]$Content)
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-External {
    param([Parameter(Mandatory)][string]$FilePath,[Parameter(Mandatory)][string[]]$Arguments,[Parameter(Mandatory)][string]$Label)
    Write-Status "$Label..." 'STEP'
    & $FilePath @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "$Label fallo con codigo $LASTEXITCODE." }
    Write-Status "$Label completado." 'OK'
}

function Save-State {
    param([string]$Phase,[string]$Status,[string]$Detail='')
    $state = [ordered]@{
        project='JEFQ Consultor'; phase=$Phase; status=$Status; detail=$Detail
        updated=(Get-Date).ToString('o'); mode=$Modo; powershell=$PSVersionTable.PSVersion.ToString()
        node=((& node --version 2>$null) -join '').Trim(); projectRoot=$ProjectRoot
        backup=$CreatedBackup; log=$LogPath
    }
    Write-Utf8File -Path $StatePath -Content ($state | ConvertTo-Json -Depth 5)
}

function Test-PhaseDone {
    param([string]$Name)
    return (Test-Path -LiteralPath (Join-Path $ControlRoot "$Name.ok"))
}

function Complete-Phase {
    param([string]$Name)
    Write-Utf8File -Path (Join-Path $ControlRoot "$Name.ok") -Content (Get-Date).ToString('o')
    Save-State -Phase $Name -Status 'completed'
}

function Invoke-Phase {
    param([string]$Name,[string]$Title,[scriptblock]$Action)
    if (-not $ForzarDesdeCero -and (Test-PhaseDone $Name)) {
        Write-Status "$Title omitida: ya estaba verificada." 'OK'
        return
    }
    Save-State -Phase $Name -Status 'running'
    Write-Status $Title 'STEP'
    & $Action
    Complete-Phase $Name
    Write-Status "$Title terminada." 'OK'
}

function New-Backup {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dest = Join-Path $BackupRoot "backup-$stamp"
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    $items = @('src','public','package.json','package-lock.json','astro.config.mjs','vercel.json','README.md')
    foreach ($item in $items) {
        $source = Join-Path $ProjectRoot $item
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force }
    }
    $manifest = Get-ChildItem -LiteralPath $dest -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        [pscustomobject]@{ path=$_.FullName.Substring($dest.Length + 1); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash; bytes=$_.Length }
    }
    Write-Utf8File -Path (Join-Path $dest 'manifest.json') -Content ($manifest | ConvertTo-Json -Depth 4)
    return $dest
}

function Test-PortAvailable {
    $listener = Get-NetTCPConnection -LocalPort 4321 -State Listen -ErrorAction SilentlyContinue
    return ($null -eq $listener)
}

try {
    Clear-Host
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ' JEFQ CONSULTOR - CONSTRUCTOR WEB SEGURO Y REANUDABLE' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan

    if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion -lt [version]'7.6.0') {
        throw 'Se requiere PowerShell 7.6+ Core.'
    }
    if (-not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw 'Se requiere PowerShell x64 sobre Windows AMD64.'
    }
    if (-not (Test-Path -LiteralPath $ProjectRoot)) { throw "No existe el proyecto Astro: $ProjectRoot" }

    New-Item -ItemType Directory -Path $ControlRoot,$BackupRoot,$LogRoot -Force | Out-Null
    $LockHandle = [System.IO.File]::Open($LockPath,[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
    Write-Status "Bloqueo exclusivo adquirido. PID $PID." 'OK'

    if ($ForzarDesdeCero) {
        Get-ChildItem -LiteralPath $ControlRoot -Filter '*.ok' -ErrorAction SilentlyContinue | Remove-Item -Force
        Write-Status 'Marcadores de fases eliminados por -ForzarDesdeCero.' 'WARN'
    }

    Invoke-Phase '00-precheck' 'Fase 00: prevalidacion' {
        foreach ($cmd in @('node','npm','npx')) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Falta $cmd en PATH." } }
        $node = [version]((& node --version).Trim().TrimStart('v'))
        if ($node -lt [version]'22.12.0') { throw "Node.js $node no es compatible; se requiere 22.12+." }
        $pkg = Join-Path $ProjectRoot 'package.json'
        if (-not (Test-Path -LiteralPath $pkg)) { throw 'Falta package.json.' }
        Write-Status "PowerShell $($PSVersionTable.PSVersion), Node $node, npm $((& npm --version).Trim())." 'OK'
    }

    Invoke-Phase '10-backup' 'Fase 10: backup versionado con hashes' {
        $script:CreatedBackup = New-Backup
        Write-Status "Backup creado: $CreatedBackup" 'OK'
    }

    Invoke-Phase '20-dependencies' 'Fase 20: dependencias reproducibles' {
        Set-Location $ProjectRoot
        if ($Modo -eq 'Reparar' -or -not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules'))) {
            if (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package-lock.json')) { Invoke-External 'npm.cmd' @('ci','--prefer-offline','--no-audit','--fund=false') 'Restauracion npm ci' }
            else { Invoke-External 'npm.cmd' @('install','--prefer-offline','--no-audit','--fund=false') 'Instalacion npm' }
        }
        Invoke-External 'npm.cmd' @('install','@astrojs/sitemap','--save','--prefer-offline','--no-audit','--fund=false') 'Verificacion de sitemap'
    }

    Invoke-Phase '30-content' 'Fase 30: estructura, contenido y SEO' {
        $astroConfig = @'
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://jefq-ciber.vercel.app",
  output: "static",
  compressHTML: true,
  trailingSlash: "never",
  integrations: [sitemap()]
});
'@
        Write-Utf8File (Join-Path $ProjectRoot 'astro.config.mjs') $astroConfig

        $layout = @'
---
import "../styles/global.css";
interface Props { title: string; description: string; noindex?: boolean; }
const { title, description, noindex = false } = Astro.props;
const base = "https://jefq-ciber.vercel.app";
const canonical = new URL(Astro.url.pathname, base).toString();
const schema = {
  "@context":"https://schema.org", "@type":"ProfessionalService",
  name:"JEFQ Consultor", url:base, telephone:"+573174832132",
  founder:{"@type":"Person",name:"Jaime Forero"},
  areaServed:{"@type":"Country",name:"Colombia"},
  address:{"@type":"PostalAddress",addressLocality:"Bogotá",addressCountry:"CO"},
  description, openingHours:"Mo-Sa 08:00-18:00", priceRange:"$$"
};
---
<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width" />
  <meta name="theme-color" content="#050b16" /><title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"} />
  <link rel="canonical" href={canonical} /><link rel="icon" href="/favicon.svg" />
  <meta property="og:type" content="website" /><meta property="og:locale" content="es_CO" />
  <meta property="og:site_name" content="JEFQ Consultor" /><meta property="og:title" content={title} />
  <meta property="og:description" content={description} /><meta property="og:url" content={canonical} />
  <script type="application/ld+json" set:html={JSON.stringify(schema)} />
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="header"><div class="container nav">
  <a class="brand" href="/"><b>J</b><span><strong>JEFQ</strong><small>CONSULTOR</small></span></a>
  <button class="menu-button" aria-label="Abrir menú" aria-expanded="false"><i></i><i></i><i></i></button>
  <nav class="menu"><a href="/#servicios">Servicios</a><a href="/#metodo">Metodología</a><a href="/#planes">Planes</a><a href="/#casos">Casos</a><a class="nav-cta" href="/#contacto">Contacto</a></nav>
</div></header>
<main id="contenido"><slot /></main>
<footer class="footer"><div class="container footer-grid">
  <div><a class="brand" href="/"><b>J</b><span><strong>JEFQ</strong><small>CONSULTOR</small></span></a><p>Ciberseguridad práctica para empresas en Bogotá y toda Colombia.</p></div>
  <div><h2>Servicios</h2><a href="/#servicios">Diagnóstico</a><a href="/#servicios">Hardening</a><a href="/#servicios">Pruebas autorizadas</a></div>
  <div><h2>Legal</h2><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a><a href="/tratamiento-datos">Datos personales</a></div>
  <div><h2>Contacto</h2><a href="tel:+573174832132">317 483 2132</a><a href="https://wa.me/573174832132">WhatsApp</a><p>Lunes a sábado, horario de oficina</p></div>
</div><div class="container footer-bottom"><span>© {new Date().getFullYear()} JEFQ Consultor</span><span>Pruebas solo con autorización escrita.</span></div></footer>
<a class="whatsapp" href="https://wa.me/573174832132?text=Hola%20Jaime%2C%20quiero%20informaci%C3%B3n%20sobre%20ciberseguridad." target="_blank" rel="noopener">WhatsApp</a>
<script>
const b=document.querySelector('.menu-button'),m=document.querySelector('.menu');
b?.addEventListener('click',()=>{const o=m?.classList.toggle('open');b.setAttribute('aria-expanded',String(Boolean(o)))});
m?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>m.classList.remove('open')));
const els=document.querySelectorAll('[data-reveal]');
if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.1});els.forEach(e=>io.observe(e))}else els.forEach(e=>e.classList.add('visible'));
</script>
</body></html>
'@
        Write-Utf8File (Join-Path $ProjectRoot 'src\layouts\Layout.astro') $layout

        $index = @'
---
import Layout from "../layouts/Layout.astro";
const wa="https://wa.me/573174832132?text="+encodeURIComponent("Hola Jaime, quiero solicitar una valoración inicial de ciberseguridad.");
const services=[
["01","Diagnóstico de seguridad","Revisión de activos, configuraciones y riesgos para definir prioridades reales."],
["02","Pruebas autorizadas","Evaluaciones controladas bajo alcance y autorización escrita."],
["03","Hardening de sistemas","Fortalecimiento de Windows, cuentas, aplicaciones y configuraciones."],
["04","Informes profesionales","Hallazgos con evidencia, impacto y acciones concretas de remediación."],
["05","Simulacros de seguridad","Ejercicios autorizados para fortalecer personas y procesos."],
["06","Acompañamiento","Apoyo para aplicar y verificar correcciones prioritarias."]];
const plans=[
["Diagnóstico Esencial","Desde $390.000",["Reunión remota","Hasta 3 equipos","Riesgos prioritarios","Informe ejecutivo","Sesión de resultados"]],
["Evaluación Pyme","Desde $890.000",["Alcance acordado","Hasta 10 activos","Revisión de configuraciones","Informe técnico y ejecutivo","Plan de remediación","Acompañamiento"]],
["Seguridad Integral","Desde $1.790.000",["Alcance personalizado","Evaluación autorizada","Hardening priorizado","Evidencias","Plan por etapas","Dos seguimientos"]]];
---
<Layout title="JEFQ Consultor | Ciberseguridad para empresas en Colombia" description="Consultoría, hardening, pruebas autorizadas e informes de ciberseguridad para empresas en Bogotá y Colombia.">
<section class="hero"><div class="grid-bg"></div><div class="container hero-grid">
<div data-reveal><div class="eyebrow"><span></span>Ciberseguridad práctica para Colombia</div><h1>Identifique sus riesgos.<em>Fortalezca su seguridad.</em></h1><p>JEFQ Consultor convierte riesgos técnicos en acciones claras para proteger equipos, cuentas, información y procesos.</p><div class="actions"><a class="button primary" href={wa}>Solicitar valoración</a><a class="button secondary" href="#servicios">Conocer servicios</a></div><div class="trust"><span>Autorización previa</span><span>Alcance controlado</span><span>Resultados comprensibles</span></div></div>
<div class="cyber" data-reveal><div class="cyber-top"><span>EVALUACIÓN DE SEGURIDAD</span><strong>ACTIVA</strong></div><div class="radar"><i></i><b>J</b><span class="p1"></span><span class="p2"></span></div><div class="cyber-steps"><div><b>01</b><span>Diagnosticar</span></div><div><b>02</b><span>Priorizar</span></div><div><b>03</b><span>Fortalecer</span></div></div></div>
</div></section>
<section class="strip"><div class="container strip-grid"><article><b>100%</b><span>Alcance autorizado</span></article><article><b>2 niveles</b><span>Informe técnico y ejecutivo</span></article><article><b>Colombia</b><span>Atención remota</span></article><article><b>Acción</b><span>Mejoras priorizadas</span></article></div></section>
<section class="section" id="servicios"><div class="container"><header class="heading" data-reveal><span>SERVICIOS</span><h2>Seguridad adaptada a su organización</h2><p>Soluciones proporcionales a su tamaño, exposición y necesidades.</p></header><div class="cards">{services.map(s=><article class="card" data-reveal><small>{s[0]}</small><i>◆</i><h3>{s[1]}</h3><p>{s[2]}</p><a href="#contacto">Consultar servicio →</a></article>)}</div></div></section>
<section class="section dark" id="metodo"><div class="container method"><header class="heading left" data-reveal><span>METODOLOGÍA</span><h2>Proceso claro, controlado y documentado</h2><p>Cada evaluación parte de autorización escrita y alcance definido.</p></header><div class="process">{[["01","Conocer el contexto"],["02","Definir alcance"],["03","Evaluar con control"],["04","Entregar y acompañar"]].map(x=><article data-reveal><b>{x[0]}</b><div><h3>{x[1]}</h3><p>Objetivos, evidencias y acciones quedan documentados.</p></div></article>)}</div></div></section>
<section class="section" id="planes"><div class="container"><header class="heading" data-reveal><span>INVERSIÓN ORIENTATIVA</span><h2>Planes de entrada transparentes</h2><p>El valor final depende del alcance, activos y complejidad.</p></header><div class="prices">{plans.map((p,i)=><article class:list={["price-card",{featured:i===1}]} data-reveal>{i===1&&<small class="badge">MÁS SOLICITADO</small>}<h3>{p[0]}</h3><strong>{p[1]}</strong><ul>{p[2].map(f=><li>✓ {f}</li>)}</ul><a class="button price-button" href={wa}>Solicitar cotización</a></article>)}</div><p class="note">Consultoría desde $120.000 COP/hora. Hardening Windows desde $290.000 COP. Valores sujetos a alcance.</p></div></section>
<section class="section dark" id="casos"><div class="container"><header class="heading" data-reveal><span>ESCENARIOS DEMOSTRATIVOS</span><h2>Ejemplos de intervención</h2><p>Nombres y situaciones ficticios, no testimonios reales.</p></header><div class="cases"><article data-reveal><small>CASO DEMOSTRATIVO</small><h3>Andina Gestión Digital S.A.S.</h3><p>Diagnóstico y hardening de estaciones Windows con plan de actualización.</p><em>Empresa completamente ficticia.</em></article><article data-reveal><small>CASO DEMOSTRATIVO</small><h3>Comercializadora NovaPyme</h3><p>Evaluación controlada, clasificación de hallazgos e informe ejecutivo.</p><em>Empresa completamente ficticia.</em></article></div></div></section>
<section class="section contact" id="contacto"><div class="container contact-grid"><div data-reveal><span class="label">CONTACTO</span><h2>Conversemos sobre lo que necesita proteger</h2><p>Valoración inicial para definir alcance, tiempos y cotización.</p><div class="contact-data"><a href="tel:+573174832132"><span>Teléfono y WhatsApp</span><b>317 483 2132</b></a><div><span>Cobertura</span><b>Bogotá y toda Colombia</b></div><div><span>Atención</span><b>Lunes a sábado, horario de oficina</b></div></div></div><form id="form" data-reveal><div class="form-row"><label>Nombre<input name="nombre" required /></label><label>Empresa<input name="empresa" /></label></div><label>Servicio<select name="servicio" required><option value="">Seleccione</option><option>Diagnóstico</option><option>Hardening</option><option>Pruebas autorizadas</option><option>Consultoría</option></select></label><label>Necesidad<textarea name="mensaje" rows="5" required></textarea></label><label class="consent"><input type="checkbox" required /><span>Acepto la <a href="/privacidad">política de privacidad</a>.</span></label><button class="button primary full">Continuar por WhatsApp</button><small>No almacenamos este formulario; prepara un mensaje para revisar.</small></form></div></section>
<script>document.querySelector('#form')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);const t=`Hola Jaime, quiero información.\nNombre: ${d.get('nombre')}\nEmpresa: ${d.get('empresa')||'No indicada'}\nServicio: ${d.get('servicio')}\nNecesidad: ${d.get('mensaje')}`;window.open(`https://wa.me/573174832132?text=${encodeURIComponent(t)}`,'_blank','noopener')})</script>
</Layout>
'@
        Write-Utf8File (Join-Path $ProjectRoot 'src\pages\index.astro') $index

        $legalTemplate = @'
---
import Layout from "../layouts/Layout.astro";
const title = "__TITLE__";
---
<Layout title={`${title} | JEFQ Consultor`} description="Información legal de JEFQ Consultor.">
<section class="legal-hero"><div class="container"><span class="label">INFORMACIÓN LEGAL</span><h1>{title}</h1><p>Versión operativa inicial. Octubre de 2026.</p></div></section>
<section class="legal"><div class="container prose">__CONTENT__</div></section>
</Layout>
'@
        $privacy = '<h2>Responsable</h2><p>JEFQ Consultor, responsable Jaime Forero, atiende solicitudes mediante el 317 483 2132.</p><h2>Finalidades</h2><p>Responder solicitudes, definir alcances, preparar propuestas y coordinar servicios autorizados.</p><h2>Formulario</h2><p>El formulario no almacena datos en servidor propio; prepara un mensaje para WhatsApp.</p><h2>Derechos</h2><p>El titular puede solicitar consulta, corrección o supresión cuando proceda.</p><h2>Actualizaciones</h2><p>La política se actualizará cuando se incorporen nuevos canales o herramientas.</p>'
        $terms = '<h2>Naturaleza</h2><p>La web presenta servicios profesionales y no constituye por sí sola una oferta definitiva.</p><h2>Precios</h2><p>Los valores son orientativos y dependen del alcance y la complejidad.</p><h2>Autorización</h2><p>Toda prueba requiere autorización escrita y alcance acordado.</p><h2>Limitaciones</h2><p>Ninguna evaluación garantiza la eliminación total de riesgos.</p><h2>Casos demostrativos</h2><p>Los nombres publicados son ficticios y no representan clientes reales.</p>'
        $data = '<h2>Responsable</h2><p>JEFQ Consultor gestiona la información recibida directamente.</p><h2>Principios</h2><p>Finalidad, libertad, transparencia, seguridad y confidencialidad.</p><h2>Consultas</h2><p>Las solicitudes pueden presentarse al 317 483 2132.</p><h2>Conservación</h2><p>La información se conserva solo durante el tiempo necesario para la finalidad informada.</p>'
        Write-Utf8File (Join-Path $ProjectRoot 'src\pages\privacidad.astro') (($legalTemplate -replace '__TITLE__','Política de privacidad') -replace '__CONTENT__',$privacy)
        Write-Utf8File (Join-Path $ProjectRoot 'src\pages\terminos.astro') (($legalTemplate -replace '__TITLE__','Términos del servicio') -replace '__CONTENT__',$terms)
        Write-Utf8File (Join-Path $ProjectRoot 'src\pages\tratamiento-datos.astro') (($legalTemplate -replace '__TITLE__','Tratamiento de datos') -replace '__CONTENT__',$data)

        $robots = "User-agent: *`nAllow: /`n`nSitemap: $BuildUrl/sitemap-index.xml`n"
        Write-Utf8File (Join-Path $ProjectRoot 'public\robots.txt') $robots
        $favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110"><defs><linearGradient id="g"><stop stop-color="#25d7ff"/><stop offset="1" stop-color="#67f2ae"/></linearGradient></defs><path fill="url(#g)" d="M50 2 96 20 89 81 50 108 11 81 4 20Z"/><path fill="#03101a" d="M37 29h28v39c0 12-7 19-19 19-7 0-13-2-18-7l9-11c3 3 6 4 9 4 4 0 6-2 6-7V42H37Z"/></svg>'
        Write-Utf8File (Join-Path $ProjectRoot 'public\favicon.svg') $favicon
        $vercel = '{"cleanUrls":true,"trailingSlash":false,"headers":[{"source":"/(.*)","headers":[{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"X-Frame-Options","value":"SAMEORIGIN"},{"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"},{"key":"Permissions-Policy","value":"camera=(), microphone=(), geolocation=(), payment=()"}]}]}'
        Write-Utf8File (Join-Path $ProjectRoot 'vercel.json') $vercel
    }

    Invoke-Phase '40-design' 'Fase 40: diseño visual y animaciones ligeras' {
        $css = @'
:root{--bg:#030813;--soft:#071323;--panel:#0a1b30;--text:#f1f7ff;--muted:#9caec3;--cyan:#25d7ff;--green:#67f2ae;--border:rgba(117,170,216,.18);--shadow:0 25px 80px rgba(0,0,0,.38);--radius:22px;--max:1160px}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:88px}body{margin:0;color:var(--text);background:radial-gradient(circle at 15% 0%,rgba(37,215,255,.08),transparent 500px),var(--bg);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}a{color:inherit;text-decoration:none}.container{width:min(calc(100% - 32px),var(--max));margin:auto}.skip{position:fixed;top:8px;left:8px;transform:translateY(-150%);z-index:9999;background:var(--cyan);color:#001018;padding:10px;border-radius:8px}.skip:focus{transform:none}.header{position:sticky;top:0;z-index:1000;background:rgba(3,8,19,.84);border-bottom:1px solid var(--border);backdrop-filter:blur(18px)}.nav{min-height:76px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:10px}.brand>b{display:grid;place-items:center;width:43px;height:48px;color:#00121a;background:linear-gradient(145deg,var(--cyan),var(--green));clip-path:polygon(50% 0,100% 18%,91% 78%,50% 100%,9% 78%,0 18%);font-size:1.3rem}.brand strong,.brand small{display:block;line-height:1}.brand small{margin-top:5px;color:var(--muted);font-size:.66rem;letter-spacing:.16em}.menu{display:flex;align-items:center;gap:27px}.menu a{font-size:.9rem;color:#c7d7e7}.menu a:hover{color:var(--cyan)}.nav-cta{padding:10px 17px!important;color:#001018!important;background:var(--cyan);border-radius:10px;font-weight:800}.menu-button{display:none;width:44px;height:44px;background:transparent;border:1px solid var(--border);border-radius:11px}.menu-button i{display:block;height:2px;margin:5px;background:white}.hero{position:relative;min-height:calc(100vh - 76px);display:grid;align-items:center;padding:84px 0;overflow:hidden}.grid-bg{position:absolute;inset:0;opacity:.22;background-image:linear-gradient(rgba(37,215,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(37,215,255,.09) 1px,transparent 1px);background-size:55px 55px;mask-image:linear-gradient(#000,transparent 88%)}.hero-grid{position:relative;display:grid;grid-template-columns:1.15fr .85fr;align-items:center;gap:75px}.eyebrow{display:inline-flex;align-items:center;gap:9px;padding:7px 12px;border:1px solid var(--border);border-radius:999px;color:#bdd5e8;background:rgba(9,27,48,.78);font-size:.74rem;text-transform:uppercase}.eyebrow span{width:8px;height:8px;background:var(--green);border-radius:50%;box-shadow:0 0 14px var(--green)}h1{font-size:clamp(3rem,6.8vw,6.1rem);line-height:.98;letter-spacing:-.065em;margin:24px 0 22px}.hero h1 em{display:block;color:transparent;background:linear-gradient(110deg,var(--cyan),var(--green));background-clip:text;font-style:normal}.hero p{color:#b3c4d6;font-size:clamp(1rem,2vw,1.22rem)}.actions{display:flex;gap:13px;flex-wrap:wrap;margin-top:32px}.button{display:inline-flex;min-height:50px;align-items:center;justify-content:center;padding:0 22px;border:1px solid transparent;border-radius:12px;font-weight:800;cursor:pointer}.primary{color:#001018;background:linear-gradient(135deg,var(--cyan),var(--green))}.secondary{background:rgba(12,34,58,.73);border-color:var(--border)}.trust{display:flex;gap:18px;flex-wrap:wrap;margin-top:29px;color:var(--muted);font-size:.82rem}.trust span:before{content:"✓";color:var(--green);margin-right:7px}.cyber{padding:22px;background:linear-gradient(145deg,rgba(17,47,80,.66),rgba(5,16,30,.96));border:1px solid rgba(37,215,255,.22);border-radius:27px;box-shadow:var(--shadow)}.cyber-top{display:flex;justify-content:space-between;font-size:.75rem}.cyber-top strong{color:var(--green)}.radar{position:relative;width:min(100%,350px);aspect-ratio:1;margin:27px auto;border:1px solid rgba(37,215,255,.2);border-radius:50%;background:repeating-radial-gradient(circle,transparent 0 42px,rgba(37,215,255,.15) 43px 44px)}.radar:before,.radar:after{content:"";position:absolute;background:rgba(37,215,255,.15)}.radar:before{width:1px;inset:0 50%}.radar:after{height:1px;inset:50% 0}.radar>i{position:absolute;top:50%;left:50%;width:45%;height:2px;transform-origin:left;background:linear-gradient(90deg,var(--cyan),transparent);animation:sweep 7s linear infinite}.radar>b{position:absolute;inset:41%;display:grid;place-items:center;color:#001018;background:linear-gradient(145deg,var(--cyan),var(--green));border-radius:50%;font-size:1.35rem}.radar>span{position:absolute;width:8px;height:8px;background:var(--green);border-radius:50%;box-shadow:0 0 13px var(--green)}.p1{top:27%;left:66%}.p2{top:70%;left:30%}.cyber-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.cyber-steps div{text-align:center;padding:12px 5px;border:1px solid var(--border);border-radius:11px;background:rgba(6,21,38,.76)}.cyber-steps b,.cyber-steps span{display:block}.cyber-steps b{color:var(--cyan)}.cyber-steps span{font-size:.7rem;color:var(--muted)}.strip{border-block:1px solid var(--border);background:rgba(7,18,34,.85)}.strip-grid{display:grid;grid-template-columns:repeat(4,1fr)}.strip article{padding:23px 27px;border-right:1px solid var(--border)}.strip b,.strip span{display:block}.strip b{color:var(--cyan);font-size:1.3rem}.strip span{color:var(--muted);font-size:.81rem}.section{padding:108px 0}.dark{background:linear-gradient(rgba(3,8,19,.2),rgba(8,22,40,.86));border-block:1px solid var(--border)}.heading{max-width:740px;margin:0 auto 52px;text-align:center}.heading>span,.label{color:var(--cyan);font-size:.75rem;font-weight:850;letter-spacing:.18em}.heading h2,.contact h2{font-size:clamp(2.2rem,5vw,3.9rem);line-height:1.07;letter-spacing:-.045em;margin:13px 0 17px}.heading p,.contact p{color:var(--muted)}.left{text-align:left;margin:0}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{position:relative;min-height:280px;padding:26px;background:linear-gradient(145deg,rgba(14,37,63,.77),rgba(6,17,31,.94));border:1px solid var(--border);border-radius:var(--radius)}.card small{position:absolute;right:20px;color:rgba(156,174,195,.4)}.card i{display:grid;width:48px;height:48px;place-items:center;color:var(--cyan);background:rgba(37,215,255,.08);border:1px solid rgba(37,215,255,.2);border-radius:14px}.card p{color:var(--muted)}.card a{color:var(--cyan);font-weight:750}.method{display:grid;grid-template-columns:.83fr 1.17fr;gap:95px}.process{border-top:1px solid var(--border)}.process article{display:grid;grid-template-columns:62px 1fr;gap:22px;padding:26px 0;border-bottom:1px solid var(--border)}.process>article>b{color:var(--cyan)}.process h3,.process p{margin:0}.process p{color:var(--muted)}.prices{display:grid;grid-template-columns:repeat(3,1fr);gap:19px}.price-card{padding:31px;background:linear-gradient(155deg,rgba(14,36,61,.82),rgba(6,17,31,.96));border:1px solid var(--border);border-radius:var(--radius)}.price-card.featured{border-color:rgba(37,215,255,.57);box-shadow:0 20px 70px rgba(0,174,235,.13);transform:translateY(-9px)}.price-card>strong{display:block;color:var(--cyan);font-size:2.2rem}.price-card ul{min-height:220px;padding:0;list-style:none;color:#cfdeeb}.price-card li{margin:11px 0}.badge{display:inline-block;padding:6px 10px;color:#001018;background:var(--cyan);border-radius:999px}.price-button{width:100%;border-color:rgba(37,215,255,.28)}.featured .price-button{color:#001018;background:linear-gradient(135deg,var(--cyan),var(--green))}.note{text-align:center;color:var(--muted)}.cases{display:grid;grid-template-columns:1fr 1fr;gap:23px}.cases article{padding:31px;background:rgba(9,28,50,.72);border:1px solid var(--border);border-radius:var(--radius)}.cases small{color:var(--green)}.cases p,.cases em{color:var(--muted)}.contact-grid{display:grid;grid-template-columns:.85fr 1.15fr;gap:80px}.contact-data{display:grid;gap:11px}.contact-data>*{display:block;padding:16px;background:rgba(9,28,50,.56);border:1px solid var(--border);border-radius:13px}.contact-data span,.contact-data b{display:block}.contact-data span{color:var(--muted);font-size:.75rem}form{padding:29px;background:rgba(8,24,44,.88);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:13px}form label{display:block;margin-bottom:15px}input,select,textarea{width:100%;margin-top:7px;padding:13px 14px;color:white;background:#071523;border:1px solid rgba(117,170,216,.22);border-radius:10px}.consent{display:flex!important;gap:10px}.consent input{width:18px}.consent a{color:var(--cyan);text-decoration:underline}.full{width:100%}form>small{display:block;text-align:center;color:var(--muted);margin-top:12px}.footer{padding-top:68px;background:#02060d;border-top:1px solid var(--border)}.footer-grid{display:grid;grid-template-columns:1.4fr .8fr .9fr 1fr;gap:38px}.footer-grid a:not(.brand),.footer-grid p{display:block;color:var(--muted);font-size:.81rem;margin:8px 0}.footer-bottom{display:flex;justify-content:space-between;padding:22px 0;margin-top:50px;border-top:1px solid var(--border);color:#71869c;font-size:.72rem}.whatsapp{position:fixed;right:20px;bottom:20px;z-index:900;padding:12px 17px;color:#00150d;background:#5cf19a;border-radius:999px;font-weight:850;box-shadow:0 13px 35px rgba(0,0,0,.36)}.legal-hero{padding:105px 0 55px;background:linear-gradient(rgba(9,31,57,.7),transparent)}.legal-hero h1{font-size:clamp(2.5rem,7vw,4.8rem)}.legal{padding:20px 0 105px}.prose{max-width:820px}.prose p{color:#b9c9d8}[data-reveal]{opacity:0;transform:translateY(19px);transition:.65s}[data-reveal].visible{opacity:1;transform:none}@keyframes sweep{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}[data-reveal]{opacity:1;transform:none}}@media(max-width:980px){.menu-button{display:block}.menu{display:none;position:absolute;top:75px;left:16px;right:16px;flex-direction:column;align-items:stretch;padding:13px;background:#071422;border:1px solid var(--border);border-radius:15px}.menu.open{display:flex}.hero-grid,.method,.contact-grid{grid-template-columns:1fr;gap:50px}.cyber{width:min(100%,560px);margin:auto}.cards,.prices{grid-template-columns:repeat(2,1fr)}.price-card.featured{transform:none}.footer-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.hero{min-height:auto;padding:68px 0}.actions,.actions .button{width:100%}.strip-grid,.cards,.prices,.cases,.form-row,.footer-grid{grid-template-columns:1fr}.strip article{border-right:0;border-bottom:1px solid var(--border)}.section{padding:80px 0}.footer-bottom{flex-direction:column}.whatsapp{right:13px;bottom:13px}}
'@
        Write-Utf8File (Join-Path $ProjectRoot 'src\styles\global.css') $css
    }

    Invoke-Phase '50-recovery' 'Fase 50: herramientas de auditoria y restauracion' {
        $restore = @'
#requires -Version 7.6
[CmdletBinding()]param([string]$BackupPath)
Set-StrictMode -Version Latest;$ErrorActionPreference='Stop'
$Root=$PSScriptRoot;$Backups=Join-Path $Root '.jefq-backups'
if(-not $BackupPath){$BackupPath=(Get-ChildItem $Backups -Directory|Sort-Object LastWriteTime -Descending|Select-Object -First 1).FullName}
if(-not $BackupPath -or -not(Test-Path $BackupPath)){throw 'No se encontró backup.'}
$Safety=Join-Path $Backups ("pre-restore-"+(Get-Date -Format 'yyyyMMdd-HHmmss'));New-Item -ItemType Directory $Safety|Out-Null
foreach($i in @('src','public','package.json','package-lock.json','astro.config.mjs','vercel.json')){$p=Join-Path $Root $i;if(Test-Path $p){Copy-Item $p $Safety -Recurse -Force};$b=Join-Path $BackupPath $i;if(Test-Path $b){if(Test-Path $p){Remove-Item $p -Recurse -Force};Copy-Item $b $p -Recurse -Force}}
Write-Host "Restaurado desde $BackupPath" -ForegroundColor Green
'@
        Write-Utf8File (Join-Path $ProjectRoot 'JEFQ-RESTAURAR.ps1') $restore
        $audit = @'
#requires -Version 7.6
Set-StrictMode -Version Latest;$ErrorActionPreference='Stop';Set-Location $PSScriptRoot
$required=@('src\pages\index.astro','src\layouts\Layout.astro','src\styles\global.css','public\robots.txt','vercel.json')
$fail=0;foreach($f in $required){if(Test-Path $f){Write-Host "[OK] $f" -ForegroundColor Green}else{Write-Host "[FALTA] $f" -ForegroundColor Red;$fail++}}
& npm.cmd run build;if($LASTEXITCODE-ne 0){$fail++}
if($fail){throw "Auditoria finalizada con $fail fallo(s)."};Write-Host 'AUDITORIA SUPERADA' -ForegroundColor Green
'@
        Write-Utf8File (Join-Path $ProjectRoot 'JEFQ-AUDITAR.ps1') $audit
    }

    Invoke-Phase '60-build' 'Fase 60: compilacion de produccion acelerada' {
        Set-Location $ProjectRoot
        $env:ASTRO_TELEMETRY_DISABLED='1';$env:NODE_ENV='production'
        Invoke-External 'npm.cmd' @('run','build') 'Compilacion Astro'
        $required=@('dist\index.html','dist\privacidad\index.html','dist\terminos\index.html','dist\tratamiento-datos\index.html','dist\sitemap-index.xml','dist\robots.txt')
        foreach($r in $required){if(-not(Test-Path (Join-Path $ProjectRoot $r))){throw "No se genero $r"}}
    }

    Invoke-Phase '70-audit' 'Fase 70: auditoria final' {
        Set-Location $ProjectRoot
        $html = Get-Content -LiteralPath (Join-Path $ProjectRoot 'dist\index.html') -Raw
        foreach($pattern in @('<title>','name="description"','rel="canonical"','application/ld\+json','317 483 2132')) {
            if($html -notmatch $pattern){throw "Validacion HTML fallida: $pattern"}
        }
        $report=[ordered]@{result='OK';date=(Get-Date).ToString('o');files=(Get-ChildItem (Join-Path $ProjectRoot 'dist') -File -Recurse).Count;buildUrl=$BuildUrl;localUrl=$LocalUrl;backup=$CreatedBackup;elapsedSeconds=[math]::Round($Stopwatch.Elapsed.TotalSeconds,2)}
        Write-Utf8File (Join-Path $ProjectRoot 'JEFQ-ESTADO.json') ($report|ConvertTo-Json -Depth 4)
    }

    if (-not $NoIniciarServidor) {
        if (Test-PortAvailable) {
            Write-Status 'Iniciando servidor Astro en una ventana separada.' 'STEP'
            Start-Process -FilePath 'pwsh.exe' -ArgumentList @('-NoLogo','-NoProfile','-Command',"Set-Location -LiteralPath '$ProjectRoot'; `$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run dev") -WorkingDirectory $ProjectRoot | Out-Null
            Start-Sleep -Seconds 4
        } else { Write-Status 'El puerto 4321 ya estaba ocupado; no se inicio otro servidor.' 'WARN' }
        if (-not $NoAbrirNavegador) { Start-Process $LocalUrl }
    }

    $Stopwatch.Stop();Save-State -Phase 'FIN' -Status 'completed' -Detail "Tiempo: $([math]::Round($Stopwatch.Elapsed.TotalSeconds,2)) s"
    Write-Host '';Write-Host '============================================================' -ForegroundColor Green
    Write-Host ' CONSTRUCCION JEFQ COMPLETADA Y AUDITADA' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host "Proyecto: $ProjectRoot" -ForegroundColor Cyan
    Write-Host "Web local: $LocalUrl" -ForegroundColor Cyan
    Write-Host "Estado: $(Join-Path $ProjectRoot 'JEFQ-ESTADO.json')" -ForegroundColor Cyan
    Write-Host "Log: $LogPath" -ForegroundColor Cyan
    Write-Host "Restaurar: pwsh -File .\JEFQ-RESTAURAR.ps1" -ForegroundColor Yellow
}
catch {
    $Stopwatch.Stop()
    try { Save-State -Phase 'ERROR' -Status 'failed' -Detail $_.Exception.Message } catch {}
    Write-Status $_.Exception.Message 'ERROR'
    if ($CreatedBackup) { Write-Status "Backup disponible para restaurar: $CreatedBackup" 'WARN' }
    Write-Host "Log: $LogPath" -ForegroundColor Yellow
    exit 1
}
finally {
    if ($LockHandle) { $LockHandle.Dispose() }
    Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}
