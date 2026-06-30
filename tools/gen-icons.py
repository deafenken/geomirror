#!/usr/bin/env python3
"""Generate GeoMirror's PNG icons (16/48/128) with no third-party dependencies.

Renders a 128px master (rounded blue tile + white map pin with a cut-out hole),
then box-downsamples to 48 and 16. Run:  python3 tools/gen-icons.py
"""
import os
import struct
import zlib


def _chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data +
            struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))


def write_png(path, w, h, rgba):
    raw = b''.join(b'\x00' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        f.write(_chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(_chunk(b'IEND', b''))


class Canvas:
    def __init__(self, size):
        self.n = size
        self.px = bytearray(size * size * 4)

    def set(self, x, y, r, g, b, a=255):
        if not (0 <= x < self.n and 0 <= y < self.n):
            return
        i = (y * self.n + x) * 4
        sa, ia = a / 255.0, self.px[i + 3] / 255.0
        oa = sa + ia * (1 - sa)
        if oa == 0:
            return
        self.px[i]     = int((r * sa + self.px[i]     * ia * (1 - sa)) / oa)
        self.px[i + 1] = int((g * sa + self.px[i + 1] * ia * (1 - sa)) / oa)
        self.px[i + 2] = int((b * sa + self.px[i + 2] * ia * (1 - sa)) / oa)
        self.px[i + 3] = int(oa * 255)

    def fill_rounded(self, r, g, b, radius):
        n = self.n
        for y in range(n):
            for x in range(n):
                in_x = x < radius or x > n - 1 - radius
                in_y = y < radius or y > n - 1 - radius
                if not (in_x and in_y):
                    self.set(x, y, r, g, b, 255)
                    continue
                cx = radius if x < radius else n - 1 - radius
                cy = radius if y < radius else n - 1 - radius
                if (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius:
                    self.set(x, y, r, g, b, 255)

    def disc(self, cx, cy, rad, r, g, b, a=255):
        for y in range(int(cy - rad) - 1, int(cy + rad) + 2):
            for x in range(int(cx - rad) - 1, int(cx + rad) + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                    self.set(x, y, r, g, b, a)

    def triangle(self, p0, p1, p2, r, g, b):
        n = self.n
        xs = (p0[0], p1[0], p2[0]); ys = (p0[1], p1[1], p2[1])
        minx, maxx = max(0, int(min(xs)) - 1), min(n - 1, int(max(xs)) + 1)
        miny, maxy = max(0, int(min(ys)) - 1), min(n - 1, int(max(ys)) + 1)

        def s(px, py, a, b):
            return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1])

        for y in range(miny, maxy + 1):
            for x in range(minx, maxx + 1):
                d1 = s(x, y, p0, p1)
                d2 = s(x, y, p1, p2)
                d3 = s(x, y, p2, p0)
                has_neg = d1 < 0 or d2 < 0 or d3 < 0
                has_pos = d1 > 0 or d2 > 0 or d3 > 0
                if not (has_neg and has_pos):
                    self.set(x, y, r, g, b, 255)

    def fill_all(self, r, g, b):
        for i in range(0, len(self.px), 4):
            self.px[i], self.px[i + 1], self.px[i + 2], self.px[i + 3] = r, g, b, 255


def render_master(size=128):
    c = Canvas(size)
    bg = (30, 64, 175)            # deep blue tile
    c.fill_rounded(*bg, radius=int(size * 0.22))

    cx, cy = size * 0.5, size * 0.42
    head = size * 0.20
    # white pin head
    c.disc(cx, cy, head, 255, 255, 255, 255)
    # white pin body (triangle to the bottom tip)
    c.triangle((cx - head * 0.78, cy + head * 0.55),
               (cx + head * 0.78, cy + head * 0.55),
               (cx, size * 0.82), 255, 255, 255)
    # cut-out hole in bg color -> ring-shaped pin head
    c.disc(cx, cy, head * 0.42, *bg, 255)
    return c.px


def downsample(src, src_n, dst_n):
    out = bytearray(dst_n * dst_n * 4)
    ratio = src_n / dst_n
    for y in range(dst_n):
        for x in range(dst_n):
            r = g = b = a = ct = 0
            for yy in range(int(y * ratio), int((y + 1) * ratio)):
                for xx in range(int(x * ratio), int((x + 1) * ratio)):
                    if 0 <= xx < src_n and 0 <= yy < src_n:
                        i = (yy * src_n + xx) * 4
                        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; ct += 1
            j = (y * dst_n + x) * 4
            ct = ct or 1
            out[j]     = r // ct
            out[j + 1] = g // ct
            out[j + 2] = b // ct
            out[j + 3] = a // ct
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    icons = os.path.join(here, '..', 'icons')
    os.makedirs(icons, exist_ok=True)
    big = render_master(128)
    write_png(os.path.join(icons, 'icon128.png'), 128, 128, big)
    m48 = downsample(big, 128, 48)
    write_png(os.path.join(icons, 'icon48.png'), 48, 48, m48)
    m16 = downsample(big, 128, 16)
    write_png(os.path.join(icons, 'icon16.png'), 16, 16, m16)
    print('icons written to', os.path.abspath(icons))


if __name__ == '__main__':
    main()
