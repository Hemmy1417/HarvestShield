"""Draws the field photographs the live proof files as evidence.

Rendered, not photographed, and said to be: a maize field under moisture stress
(rolled, greyish leaves, pale cracked soil) and one that is green and growing.
Fixed seeds, so the bytes and their digests reproduce.

    python fixtures/make_photos.py
"""
import pathlib
import random

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent / "photos"
W, H = 1024, 768


def field(seed: int, stressed: bool) -> Image.Image:
    rnd = random.Random(seed)
    sky = (205, 220, 232) if stressed else (170, 205, 235)
    img = Image.new("RGB", (W, H), sky)
    d = ImageDraw.Draw(img)
    soil = (196, 168, 128) if stressed else (110, 84, 58)
    d.rectangle([0, 300, W, H], fill=soil)
    if stressed:
        for _ in range(60):
            x, y = rnd.randint(0, W), rnd.randint(330, H)
            d.line([(x, y), (x + rnd.randint(-40, 40), y + rnd.randint(5, 30))], fill=(150, 124, 92), width=2)
    for row in range(6):
        y0 = 330 + row * 75
        for i in range(14):
            x = 40 + i * 70 + (row % 2) * 35
            h = (70 if stressed else 140) + rnd.randint(-10, 10) + row * 6
            stem = (150, 150, 95) if stressed else (60, 130, 50)
            d.line([(x, y0 + 40), (x, y0 + 40 - h)], fill=stem, width=5)
            for k in range(4):
                yy = y0 + 40 - h + k * h // 5
                if stressed:
                    leaf = (165, 160, 110)
                    d.line([(x, yy), (x + 18, yy + 10)], fill=leaf, width=4)
                    d.line([(x, yy + 6), (x - 18, yy + 16)], fill=leaf, width=4)
                else:
                    leaf = (70, 150, 55)
                    d.polygon([(x, yy), (x + 42, yy - 10), (x + 8, yy + 6)], fill=leaf)
                    d.polygon([(x, yy + 8), (x - 42, yy - 2), (x - 8, yy + 14)], fill=leaf)
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, img in (("maize-stressed-10-august.jpg", field(41, True)), ("maize-green-10-august.jpg", field(42, False))):
        img.save(OUT / name, "JPEG", quality=84, optimize=True)
        data = (OUT / name).read_bytes()
        assert data[:4] == b"\xff\xd8\xff\xe0" and len(data) < 400_000
        print(f"{name:34s} {len(data):>7,} bytes")
