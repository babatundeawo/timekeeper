from PIL import Image, ImageDraw
import math, os

OUT = "icons"
os.makedirs(OUT, exist_ok=True)

INK = (20, 22, 26, 255)
PAPER = (255, 255, 255, 255)
BRASS = (176, 141, 87, 255)

def make_icon(size, maskable=False, filename=None):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = size * (0.14 if maskable else 0.06)
    d.ellipse([pad, pad, size - pad, size - pad], fill=PAPER)

    cx, cy = size / 2, size / 2
    r = (size - pad * 2) / 2
    ring_r = r * 0.78
    ring_w = max(2, size * 0.035)
    bbox = [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r]
    d.arc(bbox, start=0, end=360, fill=(230, 228, 223, 255), width=int(ring_w))
    d.arc(bbox, start=-90, end=140, fill=BRASS, width=int(ring_w))

    hand_len = ring_r * 0.62
    ang = math.radians(140 - 90)
    hx = cx + hand_len * math.cos(ang)
    hy = cy + hand_len * math.sin(ang)
    d.line([cx, cy, hx, hy], fill=INK, width=int(size * 0.035))
    d.ellipse([cx - size*0.018, cy - size*0.018, cx + size*0.018, cy + size*0.018], fill=INK)

    img.save(os.path.join(OUT, filename))

make_icon(192, filename="icon-192.png")
make_icon(512, filename="icon-512.png")
make_icon(512, maskable=True, filename="icon-512-maskable.png")
make_icon(180, filename="icon-180.png")  # apple touch
print("icons written")
