#!/usr/bin/env python3
"""Genera public/og-image-candidata-a.png (1200x630) para M2 — IDENTIDAD ÚNICA.

No hay conversor SVG->PNG en el entorno (sin rsvg-convert ni cairosvg), así que
el PNG se dibuja directamente con PIL reutilizando la geometría EXACTA del
hexágono-"J" existente (public/favicon.svg: hexágono 100x110, "J" del favicon)
y la paleta real del sitio: gradiente ámbar #ffd07a -> #ffb43f -> #ff9f1c,
teal #0b6e66, azul oscuro #0d2540, fondo claro #f3f7fa.

Texto 100 % literal del sitio (src/pages/index.astro y Layout.astro):
- "JEFQ" / "CONSULTOR" (marca del header/pie)
- "Diagnóstico de ciberseguridad para pymes en Colombia" (H1 de la home)
- "Bogotá y toda Colombia · Atención 24/7" (topbar)
Sin candado, sin neón, sin patrón hexagonal decorativo, sin foto.
Uso: python3 scripts/generar-og-candidata-a.py  (escribe public/og-image-candidata-a.png)
"""
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

# --- "J" azul oscuro centrada en el hexágono ---
f_j = ImageFont.truetype(FONT_BOLD, 230)
# La "J" del favicon ocupa aprox. el centro; la centramos por su bounding box.
bbox = draw.textbbox((0, 0), "J", font=f_j)
jw, jh = bbox[2] - bbox[0], bbox[3] - bbox[1]
jx = OX + (HEX_W - jw) / 2 - bbox[0]
jy = OY + (HEX_H - jh) / 2 - bbox[1] - 12  # leve ajuste óptico hacia arriba
draw.text((jx, jy), "J", font=f_j, fill=NAVY)

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

# Pie: texto literal del topbar
f_foot = ImageFont.truetype(FONT_REG, 27)
draw.text((TX + 4, 556), "Bogotá y toda Colombia · Atención 24/7", font=f_foot, fill=TEAL)

# Franja ámbar inferior (cierre de marca, 10 px)
draw.rectangle([0, H - 10, W, H], fill=AMBER_MID)

img.save("public/og-image-candidata-a.png")
print("OK public/og-image-candidata-a.png", img.size)
