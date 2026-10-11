# Hoja de contactos: python3 tools/contact.py <carpeta> <salida.jpg> [columnas] [ancho_miniatura]
import sys, os
from PIL import Image, ImageDraw, ImageFont
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 420
files = sorted(f for f in os.listdir(d) if f.endswith('.png'))
ims = [Image.open(os.path.join(d, f)).convert('RGB') for f in files]
w0, h0 = ims[0].size; th = int(tw * h0 / w0); pad = 8; lab = 22
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (tw + pad) + pad, rows * (th + lab + pad) + pad), (8, 7, 10))
dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Medium.otf', 14)
except Exception: font = None
for i, (im, f) in enumerate(zip(ims, files)):
    x = pad + (i % cols) * (tw + pad); y = pad + (i // cols) * (th + lab + pad)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + lab))
    fr = int(f.split('_')[0]); dr.text((x, y + 3), f"{fr/30:6.2f}s  {f[6:-4]}", fill=(200, 195, 210), font=font)
sheet.save(out, quality=88); print(out, sheet.size)
