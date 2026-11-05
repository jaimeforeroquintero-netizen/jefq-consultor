#!/usr/bin/env python3
"""M2 — Favicon JEFQ: variantes simplificadas del hexagono-"J" para tamano pequeno.

Genera (reproducible, PIL; en el entorno no hay conversor SVG->PNG):
- public/favicon-v1.svg / favicon-v2.svg / favicon-v3.svg  (variantes candidatas)
- public/favicon-v0-16/32/48.png ... favicon-v3-16/32/48.png (renders de comparacion)
- public/favicon-comparacion.png (rejilla ampliada para evaluacion visual)

Geometria base (misma que public/favicon.svg y logo-candidato-a.svg):
hexagono 100x110: (50,2) (96,20) (89,81) (50,108) (11,81) (4,20).
La "J" original ocupa x 37-65, y 29-87 (28 de ancho, 58 de alto). A 16 px
eso deja la "J" en ~4 px de ancho: pierde reconocimiento (verificado por Pax
2026-11-05 08:59-09:15). Las variantes V1-V3 la agrandan y engrosan.

V0: geometria original, hexagono ambar (linea base de comparacion).
V1: "J" simplificada y mas gruesa/grande, azul oscuro #0d2540 (misma "J" que A/C).
V2: misma "J" que V1, en blanco #ffffff (maximo contraste sobre ambar).
V3: "J" reducida a su gesto minimo: barra vertical + gancho inferior grueso,
    sin barra superior. Azul oscuro #0d2540.

Paleta real del sitio: ambar #ffd07a 0% -> #ffb43f 48% -> #ff9f1c 100%,
teal #0b6e66, azul oscuro #0d2540, fondo claro #f3f7fa. Sin candados, sin
circuitos, sin neon, sin detalles que no sobrevivan a 16 px.
"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")

HEX = [(50, 2), (96, 20), (89, 81), (50, 108), (11, 81), (4, 20)]
# "J" original (favicon.svg), como referencia V0.
J_ORIG = "M37 29h28v39c0 12-7 19-19 19-7 0-13-2-18-7l9-11c3 3 6 4 9 4 4 0 6-2 6-7V42H37Z"
# "J" gruesa/grande (V1/V2): barra superior 30-72 x 24-38, tallo 58-72,
# gancho inferior 30-72 x 76-93 con fondo redondeado. Ocupa 42 de ancho
# (orig. 28) y 69 de alto (orig. 58). Sin serif ni detalles finos.
J_BOLD = [(30, 24), (72, 24), (72, 78), (70, 86), (63, 91), (54, 93),
          (45, 92), (37, 88), (31, 82), (30, 76), (58, 76), (58, 38), (30, 38)]
# Gesto minimo (V3): solo tallo + gancho, sin barra superior.
J_MIN = [(58, 26), (72, 26), (72, 78), (70, 86), (63, 91), (54, 93),
         (45, 92), (37, 88), (31, 82), (30, 76), (58, 76)]

AMBER = [(0.0, (0xFF, 0xD0, 0x7A)), (0.48, (0xFF, 0xB4, 0x3F)),
         (1.0, (0xFF, 0x9F, 0x1C))]
DARK = (0x0D, 0x25, 0x40)
WHITE = (0xFF, 0xFF, 0xFF)

VARIANTS = {
    "v0": ("V0 · original (linea base)", None, DARK),   # J original, path SVG
    "v1": ("V1 · J gruesa azul oscuro", J_BOLD, DARK),
    "v2": ("V2 · J gruesa blanca", J_BOLD, WHITE),
    "v3": ("V3 · gesto minimo (tallo + gancho)", J_MIN, DARK),
}


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def amber_at(t):
    for i in range(len(AMBER) - 1):
        t0, c0 = AMBER[i]
        t1, c1 = AMBER[i + 1]
        if t0 <= t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return AMBER[-1][1]


def poly(points, w, h, ox, oy):
    """Puntos 100x110 -> pixeles del lienzo (arte alto h, ancho w, offset ox,oy)."""
    return [(ox + x * w / 100.0, oy + y * h / 110.0) for (x, y) in points]


def render(variant, size, supersample=8):
    """Render RGBA size x size: el arte 100x110 encaja por alto, centrado."""
    s = size * supersample
    art_h = s
    art_w = round(s * 100 / 110)
    ox = (s - art_w) // 2
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    # Gradiente ambar vertical, recortado por el hexagono.
    grad = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        gd.line([(0, y), (s, y)], fill=amber_at(y / max(s - 1, 1)) + (255,))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).polygon(poly(HEX, art_w, art_h, ox, 0), fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    name, jpoly, jcolor = VARIANTS[variant]
    if jpoly is None:
        # V0: rasterizar la "J" original aproximando su path con poligono.
        # Path: barra 37-65 x 29-42; tallo 52-65 x 29-68; gancho inferior.
        j_orig_poly = [(37, 29), (65, 29), (65, 68), (63, 76), (58, 82),
                       (52, 85), (46, 87), (40, 85), (35, 81), (28, 80),
                       (28, 74), (37, 74), (37, 80), (40, 82), (44, 83),
                       (47, 83), (51, 81), (52, 78), (52, 42), (37, 42)]
        d.polygon(poly(j_orig_poly, art_w, art_h, ox, 0), fill=jcolor + (255,))
    else:
        d.polygon(poly(jpoly, art_w, art_h, ox, 0), fill=jcolor + (255,))
    return img.resize((size, size), Image.LANCZOS)


def svg_for(variant):
    grad = ('<defs><linearGradient id="amb" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#ffd07a"/>'
            '<stop offset="0.48" stop-color="#ffb43f"/>'
            '<stop offset="1" stop-color="#ff9f1c"/></linearGradient></defs>')
    hexp = '<path fill="url(#amb)" d="M50 2 96 20 89 81 50 108 11 81 4 20Z"/>'
    name, jpoly, jcolor = VARIANTS[variant]
    hexcol = "#0d2540" if jcolor == DARK else "#ffffff"
    if jpoly is None:
        j = f'<path fill="{hexcol}" d="{J_ORIG}"/>'
    else:
        pts = " ".join(f"{x},{y}" for x, y in jpoly)
        j = f'<polygon fill="{hexcol}" points="{pts}"/>'
    comment = {
        "v1": "V1 — J gruesa/grande azul oscuro #0d2540 (misma J que A/C, agrandada).",
        "v2": "V2 — J gruesa/grande blanca #ffffff (maximo contraste sobre ambar).",
        "v3": "V3 — gesto minimo: tallo + gancho grueso, sin barra superior.",
    }[variant]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" '
            f'role="img" aria-label="JEFQ Consultor — favicon candidato {variant.upper()}">\n'
            f'  <!-- CANDIDATO FAVICON {variant.upper()} — {comment}\n'
            f'       Hexagono existente (misma geometria que favicon.svg y logo A/C);\n'
            f'       gradiente ambar del sitio. NO es un activo vivo. -->\n'
            f'  {grad}\n  {hexp}\n  {j}\n</svg>\n')


def main():
    for v in ("v1", "v2", "v3"):
        with open(os.path.join(PUB, f"favicon-{v}.svg"), "w") as f:
            f.write(svg_for(v))
    renders = {}
    for v in VARIANTS:
        for size in (16, 32, 48):
            im = render(v, size)
            im.save(os.path.join(PUB, f"favicon-{v}-{size}.png"))
            renders[(v, size)] = im
    # Rejilla de comparacion ampliada (vecino mas cercano: lo que se ve a 16 px,
    # ampliado sin suavizar, para evaluar silueta / J / contraste).
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
        font_s = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
        font_s = font
    LIGHT = (0xF3, 0xF7, 0xFA)
    DARKBG = (0x0D, 0x25, 0x40)
    TABBG = (0xDD, 0xE5, 0xEC)  # fondo tipo pestana de navegador
    col_w, row_h = 300, 210
    label_w = 330
    W = label_w + 3 * col_w
    H = 60 + 4 * row_h + 90
    comp = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(comp)
    d.text((20, 14), "Favicon JEFQ — comparacion a 16 / 32 / 48 px (ampliado, sin suavizar)",
           fill=(0x0D, 0x25, 0x40), font=font)
    d.text((20, 38), "Cada celda: el render real a ese tamano, ampliado con vecino mas cercano.",
           fill=(0x5B, 0x72, 0x88), font=font_s)
    for c, (size, scale) in enumerate(((16, 12), (32, 6), (48, 4))):
        d.text((label_w + c * col_w + 10, 62), f"{size} px  (x{scale})",
               fill=(0x0D, 0x25, 0x40), font=font)
    for r, v in enumerate(("v0", "v1", "v2", "v3")):
        y0 = 90 + r * row_h
        d.text((20, y0 + 80), VARIANTS[v][0], fill=(0x0D, 0x25, 0x40), font=font)
        d.text((20, y0 + 106), f"favicon-{v}-*.png", fill=(0x5B, 0x72, 0x88), font=font_s)
        for c, (size, scale) in enumerate(((16, 12), (32, 6), (48, 4))):
            im = renders[(v, size)].resize((size * scale, size * scale), Image.NEAREST)
            x0 = label_w + c * col_w + 10
            # mitad clara / mitad oscura en la misma celda
            cell = Image.new("RGB", (size * scale, size * scale), LIGHT)
            cell.paste(Image.new("RGB", (size * scale // 2, size * scale), DARKBG),
                       (size * scale // 2, 0))
            cell.paste(im, (0, 0), im)
            comp.paste(cell, (x0, y0))
            d.text((x0, y0 + size * scale + 6), "claro | oscuro",
                   fill=(0x5B, 0x72, 0x88), font=font_s)
    # Tira de pestanas: los 16 px en contexto real (fondo de pestana).
    y0 = 90 + 4 * row_h + 8
    d.text((20, y0), "En pestana (16 px reales, fondo de pestana):",
           fill=(0x0D, 0x25, 0x40), font=font)
    x = 330
    for v in ("v0", "v1", "v2", "v3"):
        tab = Image.new("RGB", (150, 40), TABBG)
        tab.paste(renders[(v, 16)], (12, 12), renders[(v, 16)])
        td = ImageDraw.Draw(tab)
        td.text((36, 12), "JEFQ Consultor", fill=(0x1A, 0x1A, 0x1A), font=font_s)
        comp.paste(tab, (x, y0))
        x += 160
    comp.save(os.path.join(PUB, "favicon-comparacion.png"))
    print("OK: 3 SVG + 12 PNG + favicon-comparacion.png")


if __name__ == "__main__":
    main()
