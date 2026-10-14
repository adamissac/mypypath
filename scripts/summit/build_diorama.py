"""Build the PyPath summit diorama in Blender and export it for the home page.

Run headless (Blender is not installed system-wide; point at any 5.x build):

    "$BLENDER" -b --factory-startup --python scripts/summit/build_diorama.py -- --out <dir>

Writes <dir>/summit-raw.glb and <dir>/scene-meta.json. scripts/summit/build.sh
runs this, compresses the model and copies both into assets/.

Everything is procedural and seeded, so the model can be changed here and
rebuilt rather than living as a one-off binary. One height field drives the
terrain, the trail, the lake, the trees and the stops, so they all sit on the
same ground. Ambient occlusion is baked by Cycles into the vertex colours; the
sun and moon stay live in the browser so night mode is a lighting change.

Blender is Z-up. The glTF exporter converts to Y-up: (x, y, z) -> (x, z, -y).
"Front" (toward the hero camera) is -Y here.
"""
import argparse
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, kdtree, noise

SEED = 7
random.seed(SEED)
noise.seed_set(SEED)

# ── palette (sRGB hex) ──────────────────────────────────────────────────────
MEADOW_LOW = '#9fd3cb'
MEADOW_HIGH = '#6aaebd'
ROCK = '#5a8db0'
ROCK_DARK = '#3a6d92'
SNOW = '#eef7fc'
SNOW_SHADE = '#dcecf6'
PATH = '#f4efe2'
STRATA = ['#5b8fb4', '#4a7ea4', '#3d6d93', '#305d82', '#264d70', '#1e3f5e']
PINE = ['#1f6b7a', '#26798a', '#1a5f72', '#2d8496']
TRUNK = '#3d4f63'
STONE = '#9fb4c4'
STONE_DARK = '#7f97aa'
LANTERN = '#ffd27a'
CABIN_WALL = '#d9c7a3'
CABIN_ROOF = '#7a4b3a'
WINDOW = '#ffcf7a'
WATER = '#3aa6d8'
FALL = '#cdeefb'
FLAG = '#0ea5e9'
POLE = '#1c344c'
JACKET = '#e8783c'
SKIN = '#f3d2b5'
PACK = '#2b4a6b'


def srgb(hex_):
    hex_ = hex_.lstrip('#')
    c = [int(hex_[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # Colour attributes are stored linear; the browser converts back.
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ── ground ──────────────────────────────────────────────────────────────────
PEAKS = [
    # x, y, height, radius x, radius y
    (-0.42, 0.38, 2.75, 1.55, 1.35),
    (0.98, 0.18, 1.85, 1.15, 1.05),
    (-1.18, 0.82, 1.35, 0.95, 0.85),
    (0.35, 1.25, 1.15, 1.0, 0.75),
]
LAKE = (1.12, -1.32, 0.46, 0.34)   # centre x, y, radius x, radius y
LAKE_LEVEL = 0.125
CABIN = (-1.86, -1.42)
ROUTE = [
    (-1.70, -1.30), (-0.80, -1.62), (0.30, -1.36), (-0.95, -1.02), (0.25, -0.78),
    (-1.00, -0.50), (0.05, -0.30), (-0.80, -0.06), (-0.18, 0.12), None,  # summit appended
]
CLIMB_WEIGHT = 2.6  # stops are spaced by distance with height counted extra


def coast(angle):
    return (2.45 + 0.14 * math.sin(angle * 5) + 0.10 * math.cos(angle * 3 + 1)
            + 0.05 * math.sin(angle * 11 + 2))


def smax(a, b, k):
    h = max(k - abs(a - b), 0.0) / k
    return max(a, b) + h * h * k * 0.25


def peaks_height(x, y):
    h = 0.0
    for i, (px, py, H, rx, ry) in enumerate(PEAKS):
        dx, dy = (x - px) / rx, (y - py) / ry
        d = math.hypot(dx, dy)
        ang = math.atan2(dy, dx)
        ridge = 1 + 0.10 * math.sin(ang * 3 + i * 1.7) + 0.06 * math.cos(ang * 5 - i)
        t = max(0.0, 1 - d * ridge)
        h = smax(h, H * t ** 1.45, 0.3)
    return h


def lake_mask(x, y):
    cx, cy, rx, ry = LAKE
    d = math.hypot((x - cx) / rx, (y - cy) / ry)
    return 1 - smoothstep(0.85, 1.25, d), d


def height(x, y):
    base = 0.09 + 0.035 * noise.fractal(Vector((x * 0.9, y * 0.9, 0.3)), 1.0, 2.0, 4)
    p = peaks_height(x, y)
    rough = noise.ridged_multi_fractal(Vector((x * 2.3, y * 2.3, 1.7)), 1.0, 2.0, 5, 1.0, 2.0)
    h = base + p + p * 0.075 * (rough - 1.0)
    # The lake sits on a shelf; its basin dips below the water line.
    m, d = lake_mask(x, y)
    if m > 0:
        floor = LAKE_LEVEL - 0.05 * (1 - smoothstep(0.0, 1.0, d))
        h = h * (1 - m) + floor * m
    # A soft lip at the very edge so the meadow rounds over the cliff.
    r = math.hypot(x, y)
    edge = coast(math.atan2(y, x))
    h -= 0.05 * smoothstep(edge - 0.18, edge, r)
    return h


def normal_at(x, y, e=0.01):
    dx = (height(x + e, y) - height(x - e, y)) / (2 * e)
    dy = (height(x, y + e) - height(x, y - e)) / (2 * e)
    n = Vector((-dx, -dy, 1.0))
    n.normalize()
    return n


def summit_point():
    best = (-9, 0, 0)
    px, py = PEAKS[0][0], PEAKS[0][1]
    for i in range(-30, 31):
        for j in range(-30, 31):
            x, y = px + i * 0.012, py + j * 0.012
            h = height(x, y)
            if h > best[0]:
                best = (h, x, y)
    return best[1], best[2], best[0]


# ── trail ───────────────────────────────────────────────────────────────────
def catmull(points, samples):
    """Centripetal Catmull-Rom through points, `samples` evenly in parameter."""
    pts = [points[0]] + points + [points[-1]]
    out = []
    segs = len(points) - 1
    for s in range(segs):
        p0, p1, p2, p3 = (Vector(pts[s + k]) for k in range(4))

        def tj(ti, a, b):
            return ti + max((b - a).length, 1e-4) ** 0.5
        t0 = 0.0
        t1 = tj(t0, p0, p1)
        t2 = tj(t1, p1, p2)
        t3 = tj(t2, p2, p3)
        n = samples // segs
        for k in range(n):
            t = t1 + (t2 - t1) * k / n
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(Vector(points[-1]))
    return out


def resample(points, count):
    """Evenly spaced by arc length, so 'fraction along the trail' is honest."""
    acc = [0.0]
    for a, b in zip(points, points[1:]):
        acc.append(acc[-1] + (b - a).length)
    total = acc[-1]
    out, j = [], 0
    for i in range(count):
        s = total * i / (count - 1)
        while j < len(acc) - 2 and acc[j + 1] < s:
            j += 1
        seg = acc[j + 1] - acc[j] or 1
        t = (s - acc[j]) / seg
        out.append(points[j].lerp(points[j + 1], t))
    return out, total


# ── mesh helpers ────────────────────────────────────────────────────────────
def new_object(name, verts, faces, colors=None, uvs=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if colors is not None:
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for i, c in enumerate(colors):
            attr.data[i].color = (c[0], c[1], c[2], 1.0)
        me.color_attributes.active_color = attr
        me.attributes.default_color_name = 'Col'
    if uvs is not None:
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uvs[me.loops[li].vertex_index]
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


class Builder:
    """Accumulates verts/faces/colours for a mesh built from parts."""

    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def add(self, verts, faces, color):
        base = len(self.v)
        self.v.extend(verts)
        self.f.extend([tuple(i + base for i in face) for face in faces])
        cols = color if isinstance(color[0], (list, tuple)) else [color] * len(verts)
        self.c.extend(cols)

    def add_bm(self, bm, matrix, color):
        bm.verts.ensure_lookup_table()
        verts = [matrix @ v.co for v in bm.verts]
        faces = [[v.index for v in f.verts] for f in bm.faces]
        self.add(verts, faces, color)

    def build(self, name, smooth=True):
        return new_object(name, self.v, self.f, self.c, smooth=smooth)


def bm_cone(r1, r2, depth, segs=8):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r1, radius2=r2, depth=depth)
    return bm


def bm_ico(radius, subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    return bm


def bm_box(sx, sy, sz):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    return bm


def mat_at(x, y, z, rot=0.0, scale=1.0):
    from mathutils import Matrix
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Scale(scale, 4)


# ── build ───────────────────────────────────────────────────────────────────
def build(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    sx, sy, sz = summit_point()
    route = [p for p in ROUTE if p is not None] + [(sx, sy)]
    flat = [Vector((x, y, 0)) for x, y in route]
    dense = catmull(flat, 700)
    dense3 = [Vector((p.x, p.y, height(p.x, p.y) * CLIMB_WEIGHT)) for p in dense]
    weighted, trail_len = resample(dense3, 240)
    trail2d = [Vector((p.x, p.y, 0)) for p in weighted]
    trail = [Vector((p.x, p.y, height(p.x, p.y) + 0.014)) for p in trail2d]
    tree2d = kdtree.KDTree(len(trail2d))
    for i, p in enumerate(trail2d):
        tree2d.insert(Vector((p.x, p.y, 0)), i)
    tree2d.balance()

    def trail_dist(x, y):
        _, i, d = tree2d.find(Vector((x, y, 0)))
        return d, i

    # Top surface: concentric rings to an irregular coastline.
    RINGS, SEGS = 72, 220
    verts, cols, faces = [], [], []
    snowline_noise = lambda x, y: 0.14 * noise.noise(Vector((x * 1.6, y * 1.6, 4.2)))
    for r in range(RINGS + 1):
        for s in range(SEGS):
            a = s / SEGS * math.tau
            rad = coast(a) * (r / RINGS) ** 0.9
            x, y = math.cos(a) * rad, math.sin(a) * rad
            z = height(x, y)
            d, _ = trail_dist(x, y)
            if d < 0.075:
                z -= 0.018 * (1 - d / 0.075)
            n = normal_at(x, y)
            slope = 1 - n.z
            snow_at = 1.25 + snowline_noise(x, y) + (0.2 if x > 0.4 else 0.0)
            if z > snow_at and slope < 0.62:
                c = mix(srgb(SNOW_SHADE), srgb(SNOW), (z - snow_at) / 0.6)
            elif slope > 0.28 or z > snow_at - 0.3:
                c = mix(srgb(ROCK), srgb(ROCK_DARK), smoothstep(0.2, 0.55, slope))
                if z > snow_at - 0.25 and slope < 0.7:
                    c = mix(c, srgb(SNOW_SHADE), 0.6)
            else:
                c = mix(srgb(MEADOW_LOW), srgb(MEADOW_HIGH), z / 1.1)
                c = mix(c, srgb(ROCK), smoothstep(0.16, 0.3, slope))
            if d < 0.045:
                c = mix(c, srgb(PATH), 1 - d / 0.045)
            verts.append((x, y, z))
            cols.append(c)
    # Collapse the centre ring (radius 0) to one vertex.
    centre = len(verts)
    verts.append((0.0, 0.0, height(0, 0)))
    cols.append(cols[0])
    for s in range(SEGS):
        faces.append((centre, SEGS + s, SEGS + (s + 1) % SEGS))
    for r in range(1, RINGS):
        for s in range(SEGS):
            a = r * SEGS + s
            b = r * SEGS + (s + 1) % SEGS
            c_ = (r + 1) * SEGS + (s + 1) % SEGS
            d_ = (r + 1) * SEGS + s
            faces.append((a, d_, c_, b))

    island = new_object('island', verts, faces, cols)

    # Underside: strata tapering to a point. Its own mesh so the browser can
    # keep it out of the shadow map's receivers (self-shadowing blotches).
    rim = RINGS * SEGS
    uv_, uc, uf = [], [], []
    prev = []
    for s_ in range(SEGS):
        prev.append(len(uv_))
        uv_.append(verts[rim + s_])
        uc.append(srgb(STRATA[0]))
    LAYERS = [(1.0, 0.0), (0.98, -0.12), (0.9, -0.34), (0.76, -0.62), (0.57, -0.9), (0.36, -1.15), (0.16, -1.36)]
    for li, (rf, dz) in enumerate(LAYERS[1:], start=1):
        ring = []
        for s_ in range(SEGS):
            a = s_ / SEGS * math.tau
            jag = 0.035 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, li * 1.3)))
            rad = coast(a) * (rf + jag * 0.5)
            z = 0.04 + dz + 0.05 * noise.noise(Vector((math.cos(a) * 2.2, math.sin(a) * 2.2, li * 0.7)))
            ring.append(len(uv_))
            uv_.append((math.cos(a) * rad, math.sin(a) * rad, z))
            uc.append(srgb(STRATA[min(li, len(STRATA) - 1)]))
        for s_ in range(SEGS):
            t = (s_ + 1) % SEGS
            uf.append((prev[s_], prev[t], ring[t], ring[s_]))
        prev = ring
    tip = len(uv_)
    uv_.append((0.1, -0.05, -1.62))
    uc.append(srgb(STRATA[-1]))
    for s_ in range(SEGS):
        uf.append((prev[s_], prev[(s_ + 1) % SEGS], tip))
    new_object('underside', uv_, uf, uc)

    # Lake surface.
    cx, cy, rx, ry = LAKE
    lv, lf = [(cx, cy, LAKE_LEVEL)], []
    for i in range(48):
        a = i / 48 * math.tau
        w = 1 + 0.06 * math.sin(a * 3) + 0.04 * math.cos(a * 5)
        lv.append((cx + math.cos(a) * rx * 0.98 * w, cy + math.sin(a) * ry * 0.98 * w, LAKE_LEVEL))
    for i in range(48):
        lf.append((0, 1 + i, 1 + (i + 1) % 48))
    new_object('lake', lv, lf, [srgb(WATER)] * len(lv))

    # Waterfall: from the lake's seaward edge over the cliff.
    out_dir = Vector((cx, cy, 0)).normalized()
    ang = math.atan2(out_dir.y, out_dir.x)
    edge_r = coast(ang)
    start = Vector((cx, cy, 0)) + out_dir * rx * 0.9
    fv, fuv, ff = [], [], []
    steps = 26
    side = Vector((-out_dir.y, out_dir.x, 0))
    path = []
    for k in range(steps):
        t = k / (steps - 1)
        if t < 0.35:
            u = t / 0.35
            p = start.lerp(out_dir * (edge_r + 0.02), u)
            z = LAKE_LEVEL - 0.03 * u
        else:
            u = (t - 0.35) / 0.65
            p = out_dir * (edge_r + 0.025 + 0.05 * u * u)
            z = LAKE_LEVEL - 0.03 - 1.05 * u
        path.append(Vector((p.x, p.y, z)))
    for k, p in enumerate(path):
        w = 0.07 + 0.03 * (k / steps)
        fv.extend([p + side * w, p - side * w])
        v = k / (steps - 1)
        fuv.extend([(0.0, v), (1.0, v)])
    for k in range(steps - 1):
        a = k * 2
        ff.append((a, a + 1, a + 3, a + 2))
    new_object('waterfall', fv, ff, [srgb(FALL)] * len(fv), uvs=fuv, smooth=True)

    # Trail ribbon: lights up from the cabin to the summit in the browser.
    tv, tuv, tf = [], [], []
    for i, p in enumerate(trail):
        nxt = trail[min(i + 1, len(trail) - 1)] - trail[max(i - 1, 0)]
        nxt.z = 0
        nxt.normalize()
        sd = Vector((-nxt.y, nxt.x, 0)) * 0.022
        a, b = p + sd, p - sd
        a.z = height(a.x, a.y) + 0.006
        b.z = height(b.x, b.y) + 0.006
        tv.extend([a, b])
        u = i / (len(trail) - 1)
        tuv.extend([(u, 0.0), (u, 1.0)])
    for i in range(len(trail) - 1):
        a = i * 2
        tf.append((a, a + 1, a + 3, a + 2))
    new_object('trail', tv, tf, [srgb(PATH)] * len(tv), uvs=tuv)

    # Stops: cairns beside the trail at equal arc length, stop 10 at the top.
    stops = []
    for n in range(10):
        f = 0.04 + 0.96 * n / 9
        i = round(f * (len(trail2d) - 1))
        p = trail2d[i]
        d = trail2d[min(i + 1, len(trail2d) - 1)] - trail2d[max(i - 1, 0)]
        d.normalize()
        off = Vector((-d.y, d.x, 0)) * (0.075 if n < 9 else 0.0)
        if n == 9:
            off = Vector((0.07, -0.05, 0))
        x, y = p.x + off.x, p.y + off.y
        z = height(x, y)
        cairn = Builder()
        h = 0.0
        for k, (r, sq) in enumerate([(0.034, 0.65), (0.027, 0.7), (0.02, 0.75)]):
            bm = bm_ico(r, 1)
            from mathutils import Matrix
            m = Matrix.Translation((x, y, z + h + r * sq * 0.8)) @ Matrix.Diagonal((1.0, 1.0, sq, 1.0))
            cairn.add_bm(bm, m, srgb(STONE if k % 2 == 0 else STONE_DARK))
            h += r * sq * 1.55
            bm.free()
        cairn.build('stop_%02d' % (n + 1))
        lamp = Builder()
        bm = bm_box(0.016, 0.016, 0.022)
        lamp.add_bm(bm, mat_at(x, y, z + h + 0.012), srgb(LANTERN))
        bm.free()
        lamp.build('lantern_%02d' % (n + 1), smooth=False)
        stops.append({'n': n + 1, 'fraction': f, 'trailIndex': i, 'base': [x, y, z], 'top': [x, y, z + h + 0.03]})

    # Pines in groves, kept off the trail, the lake and steep or high ground.
    pines = Builder()
    placed = 0
    tries = 0
    while placed < 78 and tries < 5000:
        tries += 1
        a = random.random() * math.tau
        r = math.sqrt(random.random()) * coast(a) * 0.93
        x, y = math.cos(a) * r, math.sin(a) * r
        z = height(x, y)
        n = normal_at(x, y)
        if z > 1.15 or z < 0.07 or (1 - n.z) > 0.28:
            continue
        if lake_mask(x, y)[1] < 1.9:
            continue
        if trail_dist(x, y)[0] < 0.16 or math.hypot(x - CABIN[0], y - CABIN[1]) < 0.3:
            continue
        if noise.noise(Vector((x * 1.4, y * 1.4, 9.0))) < -0.05:
            continue
        s = 0.75 + random.random() * 0.55
        col = srgb(random.choice(PINE))
        bm = bm_cone(0.016, 0.016, 0.06, 6)
        pines.add_bm(bm, mat_at(x, y, z + 0.03 * s, scale=s), srgb(TRUNK))
        bm.free()
        for k, (r1, hh, zz) in enumerate([(0.085, 0.13, 0.11), (0.066, 0.11, 0.18), (0.045, 0.09, 0.245)]):
            bm = bm_cone(r1, 0.0, hh, 8)
            shade = mix(col, srgb('#ffffff'), 0.06 * k)
            pines.add_bm(bm, mat_at(x, y, z + zz * s, rot=random.random(), scale=s), shade)
            bm.free()
        placed += 1
    pines.build('pines', smooth=False)

    # Boulders.
    rocks = Builder()
    for _ in range(26):
        a = random.random() * math.tau
        r = math.sqrt(random.random()) * coast(a) * 0.9
        x, y = math.cos(a) * r, math.sin(a) * r
        if trail_dist(x, y)[0] < 0.08 or lake_mask(x, y)[1] < 1.2 or height(x, y) > 1.4:
            continue
        bm = bm_ico(0.03 + random.random() * 0.04, 1)
        for v in bm.verts:
            v.co *= 0.85 + 0.3 * noise.noise(v.co * 20)
            v.co.z *= 0.6
        rocks.add_bm(bm, mat_at(x, y, height(x, y) + 0.01, rot=random.random() * 3), srgb(STONE_DARK))
        bm.free()
    rocks.build('rocks')

    # Cabin at the trailhead.
    hx, hy = CABIN
    hz = height(hx, hy)
    cabin = Builder()
    bm = bm_box(0.24, 0.17, 0.12)
    cabin.add_bm(bm, mat_at(hx, hy, hz + 0.06, rot=0.25), srgb(CABIN_WALL))
    bm.free()
    roof_v = [(-0.14, -0.11, 0.0), (0.14, -0.11, 0.0), (0.14, 0.11, 0.0), (-0.14, 0.11, 0.0), (-0.14, 0.0, 0.09), (0.14, 0.0, 0.09)]
    roof_f = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5)]
    m = mat_at(hx, hy, hz + 0.12, rot=0.25)
    cabin.add([m @ Vector(v) for v in roof_v], roof_f, srgb(CABIN_ROOF))
    bm = bm_box(0.03, 0.03, 0.07)
    cabin.add_bm(bm, mat_at(hx, hy, hz, rot=0.25) @ mat_at(0.07, 0.05, 0.19), srgb(CABIN_ROOF))
    bm.free()
    cabin.build('cabin', smooth=False)
    win = Builder()
    for wx in (-0.06, 0.06):
        bm = bm_box(0.04, 0.006, 0.035)
        win.add_bm(bm, mat_at(hx, hy, hz, rot=0.25) @ mat_at(wx, -0.087, 0.07), srgb(WINDOW))
        bm.free()
    win.build('cabin_windows', smooth=False)

    # Summit flag.
    pole = Builder()
    bm = bm_cone(0.008, 0.008, 0.42, 6)
    pole.add_bm(bm, mat_at(sx, sy, sz + 0.21), srgb(POLE))
    bm.free()
    pole.build('flagpole')
    gv, gf, guv = [], [], []
    GX, GY = 14, 7
    for j in range(GY + 1):
        for i in range(GX + 1):
            gv.append((sx + 0.008 + 0.28 * i / GX, sy, sz + 0.25 + 0.17 * j / GY))
            guv.append((i / GX, j / GY))
    for j in range(GY):
        for i in range(GX):
            a = j * (GX + 1) + i
            gf.append((a, a + 1, a + GX + 2, a + GX + 1))
    new_object('flag', gv, gf, [srgb(FLAG)] * len(gv), uvs=guv, smooth=True)

    # The hiker: origin at the feet, facing +X.
    hiker = Builder()
    bm = bm_cone(0.017, 0.013, 0.05, 8)
    hiker.add_bm(bm, mat_at(0, 0, 0.042), srgb(JACKET))
    bm.free()
    bm = bm_ico(0.014, 2)
    hiker.add_bm(bm, mat_at(0, 0, 0.083), srgb(SKIN))
    bm.free()
    bm = bm_box(0.018, 0.026, 0.032)
    hiker.add_bm(bm, mat_at(-0.019, 0, 0.048), srgb(PACK))
    bm.free()
    for ly in (-0.007, 0.007):
        bm = bm_cone(0.006, 0.006, 0.02, 6)
        hiker.add_bm(bm, mat_at(0, ly, 0.01), srgb(PACK))
        bm.free()
    hiker.build('hiker')

    bake_ao()

    os.makedirs(out, exist_ok=True)
    glb = os.path.join(out, 'summit-raw.glb')
    export(glb)

    def yup(v):
        return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]

    meta = {
        'generatedBy': 'scripts/summit/build_diorama.py',
        'summit': yup((sx, sy, sz)),
        'trail': [yup(p) for p in trail],
        'trailLength': round(trail_len, 4),
        'stops': [{'n': s['n'], 'fraction': round(s['fraction'], 4), 'trailIndex': s['trailIndex'],
                   'base': yup(s['base']), 'top': yup(s['top'])} for s in stops],
        'cabinDoor': yup((hx + 0.02, hy - 0.11, hz)),
        'flag': yup((sx + 0.15, sy, sz + 0.34)),
        'lake': yup((cx, cy, LAKE_LEVEL)),
        'camera': {'position': [0, 3.4, 10.4], 'target': [0, 0.55, 0], 'fov': 34},
    }
    with open(os.path.join(out, 'scene-meta.json'), 'w') as fh:
        json.dump(meta, fh, separators=(',', ':'))
    print('wrote', glb, 'and scene-meta.json')


def bake_ao():
    """Cycles AO into each mesh's colour attribute, multiplied over albedo."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 128
    scene.render.bake.target = 'VERTEX_COLORS'
    scene.world = bpy.data.worlds.new('World')
    scene.world.light_settings.distance = 0.6
    meshes = [o for o in scene.objects if o.type == 'MESH']
    for ob in meshes:
        if ob.name in ('hiker', 'flag', 'trail', 'waterfall', 'lake') or ob.name.startswith('lantern'):
            continue
        me = ob.data
        albedo = [tuple(d.color) for d in me.color_attributes['Col'].data]
        ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = ao
        mat = bpy.data.materials.new(ob.name + '_bake')
        me.materials.clear()
        me.materials.append(mat)
        for o in scene.objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO')
        col = me.color_attributes['Col']
        strength = 0.5 if ob.name in ('island', 'underside') else 0.42
        for i, d in enumerate(ao.data):
            a = d.color[0]
            k = (1 - strength) + strength * a
            c = albedo[i]
            col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
        me.color_attributes.remove(ao)
        me.color_attributes.active_color = me.color_attributes['Col']
        me.materials.clear()


def export(path):
    kwargs = dict(filepath=path, export_format='GLB', use_selection=False, export_apply=True,
                  export_cameras=False, export_lights=False, export_yup=True,
                  export_texcoords=True, export_normals=True, export_materials='NONE')
    for extra in ({'export_vertex_color': 'ACTIVE'}, {'export_colors': True}, {}):
        try:
            bpy.ops.export_scene.gltf(**kwargs, **extra)
            return
        except TypeError:
            continue
    raise RuntimeError('glTF export failed')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    build(ap.parse_args(argv).out)
