#!/usr/bin/env python3
"""Create extension PNG icons. Works with Pillow or a tiny raw PNG writer."""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def via_pillow():
    from PIL import Image, ImageDraw

    def make(size):
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        pad = max(1, size // 16)
        d.rounded_rectangle(
            [pad, pad, size - 1 - pad, size - 1 - pad],
            radius=max(2, size // 5),
            fill=(9, 9, 11, 255),
        )
        left, right = int(size * 0.36), int(size * 0.72)
        top, bot, mid = int(size * 0.28), int(size * 0.72), size // 2
        d.polygon([(left, top), (left, bot), (right, mid)], fill=(94, 234, 212, 255))
        dest = OUT / f"icon{size}.png"
        img.save(dest, "PNG")
        print("wrote", dest, dest.stat().st_size)

    for s in (16, 32, 48, 128):
        make(s)


def via_raw():
    import struct
    import zlib

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    def png(size, rgba_rows):
        raw = b"".join(b"\x00" + bytes(row) for row in rgba_rows)
        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b"")
        )

    def make(size):
        pixels = []
        pad = max(1, size // 16)
        radius = max(2, size // 5)
        left, right = int(size * 0.36), int(size * 0.72)
        top, bot, midy = int(size * 0.28), int(size * 0.72), size // 2
        for y in range(size):
            row = []
            for x in range(size):
                ix = min(x - pad, size - 1 - pad - x)
                iy = min(y - pad, size - 1 - pad - y)
                inside = ix >= 0 and iy >= 0 and (ix >= radius or iy >= radius or (ix - radius) ** 2 + (iy - radius) ** 2 <= radius * radius)
                in_tri = False
                if top <= y <= bot and left <= x <= right:
                    max_x = left + (right - left) * (1 - abs((y - midy) / max(1, midy - top)))
                    in_tri = x <= max_x and x >= left
                if in_tri:
                    row.extend((94, 234, 212, 255))
                elif inside:
                    row.extend((9, 9, 11, 255))
                else:
                    row.extend((0, 0, 0, 0))
            pixels.append(row)
        dest = OUT / f"icon{size}.png"
        dest.write_bytes(png(size, pixels))
        print("wrote", dest, dest.stat().st_size)

    for s in (16, 32, 48, 128):
        make(s)


if __name__ == "__main__":
    try:
        via_pillow()
    except Exception as e:
        print("pillow fallback", e)
        via_raw()
