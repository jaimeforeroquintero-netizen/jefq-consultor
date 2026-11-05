#!/usr/bin/env python3
"""Genera public/og-image-candidata-final.png (1200x630) para M2 — OG-IMAGE FINAL.

Revalidación de la candidata A contra el sistema final A + C (decisión de Jaime
2026-11-05 09:25) y regeneración desde el final A. Cambios respecto a la
candidata A (scripts/generar-og-candidata-a.py, public/og-image-candidata-a.png):

1. La "J" ya NO es un glifo de fuente (Liberation Sans Bold): es el path EXACTO
   de la "J" del logotipo final A (public/logo-jefq.svg, copiado del favicon):
   M37 29h28v39c0 12-7 19-19 19-7 0-13-2-18-7l9-11c3 3 6 4 9 4 4 0 6-2 6-7V42H37Z.
   Se rasteriza el path (muestreo de las curvas de Bézier) con la misma escala
   x3.3 y el mismo origen que el hexágono, sin recentrado óptico: la "J" queda
   en su posición exacta dentro del hexágono, como en el logotipo final A.
   (La "J" engrosada V1 del favicon candidato NO se usa aquí: es variante
   específica para 16-48 px; a 1200x630 manda la geometría del logotipo.)
2. El pie ya NO dice "Atención 24/7": el topbar vivo (src/layouts/Layout.astro:107)
   dice "Bogotá y toda Colombia" + "Atención remota 24/7". El texto final es
   la unión literal del topbar: "Bogotá y toda Colombia · Atención remota 24/7".

Todo lo demás es idéntico a la candidata A (ya verificada visualmente por Pax):
mismo layout, mismas posiciones y tamaños, mismo hexágono con gradiente ámbar
#ffd07a 0% -> #ffb43f 48% -> #ff9f1c 100%, mismos colores (#0d2540, #14202e,
#0b6e66, fondo #f3f7fa), mismo wordmark, mismo H1 literal de la home
("Diagnóstico de ciberseguridad para pymes en Colombia", src/pages/index.astro:22),
misma regla ámbar y misma franja ámbar inferior. Sin candado, sin neón, sin
patrón hexagonal decorativo, sin foto, sin claims ni credenciales inventadas.

Uso: python3 scripts/generar-og-candidata-final.py  (escribe public/og-image-candidata-final.png)
"""
import re

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (0xF3, 0xF7, 0xFA)          # fondo claro del sitio
NAVY = (0x0D, 0x25, 0x40)       # azul oscuro #0d2540
NAVY2 = (0x14, 0x20, 0x2E)      # #14202e
TEAL = (0x0B, 0x6E, 0x66)        # teal #0b6e66
AMBER_TOP = (0xFF, 0xD0, 0x7A)   # #ffd07a
AMBER_MID = (0xFF, 0xB4, 0x3F)   # #ffb43f
AMBER_BOT = (0xFF, 0x9F, 0x1C)   # #ff9f1c

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

# Hexágono del favicon (viewBox 0 0 100 110), escalado x3.3 y centrado a la izquierda.
SCALE = 3.3
HEX = [(50, 2), (96, 20), (89, 81), (50, 108), (11, 81), (4, 20)]
OX, OY = 90, 150  # esquina superior del cuadro del hexágono
hex_pts = [(OX + x * SCALE, OY + y * SCALE) for x, y in HEX]
HEX_W, HEX_H = 100 * SCALE, 110 * SCALE  # 330 x 363

# "J" EXACTA del logotipo final A (public/logo-jefq.svg), misma fuente que el
# hexágono: public/favicon.svg. NO es la "J" engrosada V1 del favicon.
J_PATH = "M37 29h28v39c0 12-7 19-19 19-7 0-13-2-18-7l9-11c3 3 6 4 9 4 4 0 6-2 6-7V42H37Z"


def parse_j_path(d):
    """Rasteriza el path de la "J" a polígono. Soporta M, h, v, c, l, V, H, Z
    (los comandos que usa este path). Las cúbicas se muestrean en 32 tramos."""
    tokens = re.findall(r"[MmHhVvCcLlZz]|-?\d+(?:\.\d+)?", d)
    pts = []
    i = 0
    x = y = 0.0
    sx = sy = 0.0
    prev_cmd = None

    def cubic(p0, p1, p2, p3, n=32):
        out = []
        for k in range(1, n + 1):
            t = k / n
            mt = 1 - t
            out.append((
                mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
                mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1],
            ))
        return out

    while i < len(tokens):
        cmd = tokens[i]
        # Repetición implícita: un número donde se espera comando repite el
        # comando anterior (SVG: "c0 12-7 19-19 19-7 0..." = dos cúbicas).
        if cmd[0] not in "MmHhVvCcLlZz":
            if prev_cmd is None:
                raise ValueError("número sin comando previo: %r" % cmd)
            cmd = prev_cmd
        else:
            i += 1
            prev_cmd = cmd
        if cmd == "M":
            x, y = float(tokens[i]), float(tokens[i + 1])
            i += 2
            sx, sy = x, y
            pts.append((x, y))
        elif cmd == "h":
            x += float(tokens[i])
            i += 1
            pts.append((x, y))
        elif cmd == "v":
            y += float(tokens[i])
            i += 1
            pts.append((x, y))
        elif cmd == "c":
            nums = [float(t) for t in tokens[i:i + 6]]
            i += 6
            p1 = (x + nums[0], y + nums[1])
            p2 = (x + nums[2], y + nums[3])
            p3 = (x + nums[4], y + nums[5])
            pts.extend(cubic((x, y), p1, p2, p3))
            x, y = p3
        elif cmd == "l":
            x += float(tokens[i])
            y += float(tokens[i + 1])
            i += 2
            pts.append((x, y))
        elif cmd == "V":
            y = float(tokens[i])
            i += 1
            pts.append((x, y))
        elif cmd == "H":
            x = float(tokens[i])
            i += 1
            pts.append((x, y))
        elif cmd == "Z":
            pts.append((sx, sy))
        else:
            raise ValueError("comando no soportado en J_PATH: %r" % cmd)
    return pts


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def amber_at(y_frac):
    """Gradiente ámbar del sitio: #ffd07a 0%, #ffb43f 48%, #ff9f1c 100%."""
    if y_frac <= 0.48:
        return lerp(AMBER_TOP, AMBER_MID, y_frac / 0.48)
    return lerp(AMBER_MID, AMBER_BOT, (y_frac - 0.48) / 0.52)


img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# --- Hexágono con gradiente ámbar (vía máscara) ---
grad = Image.new("RGB", (int(HEX_W) + 2, int(HEX_H) + 2))
gd = ImageDraw.Draw(grad)
for y in range(grad.height):
    gd.line([(0, y), (grad.width, y)], fill=amber_at(y / max(grad.height - 1, 1)))
mask = Image.new("L", (int(HEX_W) + 2, int(HEX_H) + 2), 0)
md = ImageDraw.Draw(mask)
md.polygon([(x - OX, y - OY) for x, y in hex_pts], fill=255)
img.paste(grad, (OX, OY), mask)

# --- "J" EXACTA del logotipo final A (path rasterizado, supersampling x4) ---
SS = 4  # supersampling para bordes suaves (el polígono PIL a 1x queda dentado)
j_pts = parse_j_path(J_PATH)
j_scaled = [(OX + x * SCALE, OY + y * SCALE) for x, y in j_pts]
jmask_big = Image.new("L", (W * SS, H * SS), 0)
jd = ImageDraw.Draw(jmask_big)
jd.polygon([(x * SS, y * SS) for x, y in j_scaled], fill=255)
jmask = jmask_big.resize((W, H), Image.LANCZOS)
navy_layer = Image.new("RGB", (W, H), NAVY)
img.paste(navy_layer, (0, 0), jmask)

# --- Bloque de texto a la derecha ---
TX = 500
f_word = ImageFont.truetype(FONT_BOLD, 148)
draw.text((TX, 118), "JEFQ", font=f_word, fill=NAVY)

# "CONSULTOR" con tracking, en teal
f_sub = ImageFont.truetype(FONT_BOLD, 40)
tracking = 17
x = TX + 4
y_cons = 292
for ch in "CONSULTOR":
    draw.text((x, y_cons), ch, font=f_sub, fill=TEAL)
    x += draw.textlength(ch, font=f_sub) + tracking

# Regla ámbar bajo el wordmark
draw.rectangle([TX + 4, 372, TX + 4 + 190, 380], fill=AMBER_MID)

# Subtítulo: H1 literal de la home, en dos líneas
f_h = ImageFont.truetype(FONT_REG, 47)
draw.text((TX + 4, 408), "Diagnóstico de ciberseguridad", font=f_h, fill=NAVY2)
draw.text((TX + 4, 470), "para pymes en Colombia", font=f_h, fill=NAVY2)

# Pie: texto literal del topbar (Layout.astro:107): "Bogotá y toda Colombia"
# + "Atención remota 24/7". Si no cabe a 27 px, se baja el tamaño, no el texto.
FOOT = "Bogotá y toda Colombia · Atención remota 24/7"
f_foot = ImageFont.truetype(FONT_REG, 27)
while draw.textlength(FOOT, font=f_foot) > 690 and f_foot.size > 18:
    f_foot = ImageFont.truetype(FONT_REG, f_foot.size - 1)
draw.text((TX + 4, 556), FOOT, font=f_foot, fill=TEAL)

# Franja ámbar inferior (cierre de marca, 10 px)
draw.rectangle([0, H - 10, W, H], fill=AMBER_MID)

img.save("public/og-image-candidata-final.png")
print("OK public/og-image-candidata-final.png", img.size, "pie a", f_foot.size, "px")
