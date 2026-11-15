#!/usr/bin/env python3
"""Builds a Portal2 menu panel-flip sound for the BurnMyWindows "Aperture Panels" effect.

Assumes the following files are found in the current directory:
     ui_menu_flip_single_01.wav
     ui_menu_flip_single_02.wav

These files can be found in: <install_path>/Portal 2/portal2/pak01_dir.vpk
In pak01_dir.vpk: pak01/sound/ui/

Use https://github.com/craftablescience/VPKEdit to extract the files from the pak

The clack timing and levels follow a reference recording of the game's menu:
A dense burst, then one faint straggler. The dense burst is stretched onto the
window in which the effect's panels are flipping (same maths as
resources/shaders/aperture-panels.frag with the default settings), so it lines
up with the animation. Each run varies the clacks a little (timing, pitch, level,
sample, stereo position); change the seed for another take.

usage: make_aperture_flip_sound.py DURATION_MS OUT.wav [seed] [length_s]
   or: make_aperture_flip_sound.py DURATION_MS LEAD_IN_S LENGTH_S OUT.wav [seed]
   or: make_aperture_flip_sound.py DURATION_MS OUT.wav --seed 7 --length 1.2 --lead-in 0
   DURATION_MS  the effect's "Effect Duration (ms)" setting
   LENGTH_S     length of the file (default: what is left of the animation)
   LEAD_IN_S    seconds cut off the start of the animation (default 0); the sound is
                played when the animation starts, so normally leave this at 0
"""
import sys, wave, math, random, array, os

def parse_args(argv):
    opts = {"seed": 2011, "length": None, "lead-in": 0.0}
    pos = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("-h", "--help"):
            print(__doc__); sys.exit(0)
        if a.startswith("--"):
            name, _, val = a[2:].partition("=")
            if name not in opts:
                sys.exit(f"unknown option --{name}")
            if not val:
                i += 1
                if i >= len(argv): sys.exit(f"--{name} needs a value")
                val = argv[i]
            opts[name] = val
        else:
            pos.append(a)
        i += 1
    if not pos:
        sys.exit(__doc__)
    dur = float(pos[0]); rest = pos[1:]
    out = next((a for a in rest if not _is_number(a)), "aperture-panels-flip.wav")
    k = rest.index(out) if out in rest else len(rest)
    before, after = rest[:k], rest[k + 1:]
    if len(before) >= 2:            # old order: DURATION LEAD_IN LENGTH OUT [seed]
        opts["lead-in"], opts["length"] = before[0], before[1]
        if after: opts["seed"] = after[0]
    else:                           # new order: DURATION OUT [seed] [length]
        if before: opts["seed"] = before[0]
        if after: opts["seed"] = after[0]
        if len(after) > 1: opts["length"] = after[1]
    lead = float(opts["lead-in"])
    length = float(opts["length"]) if opts["length"] is not None else dur / 1000 - lead
    return dur, out, int(float(opts["seed"])), length, lead

def _is_number(a):
    try: float(a); return True
    except ValueError: return False

DUR_MS, OUT, SEED, LENGTH, LEAD_IN = parse_args(sys.argv[1:])
if LENGTH <= 0.05: sys.exit("the file would be too short; check LENGTH_S / LEAD_IN_S")
rng  = random.Random(SEED)
HERE = os.path.dirname(os.path.abspath(__file__))

# ---- the reference: (time in s, level in dB) of each clack, measured from the recording.
#      The dense burst runs from BURST[0] to BURST[1].
#      (The recording also has three faint clacks ~0.3 s before the burst, at 0.026,
#      0.098 and 0.114 s; they land before any panel turns, so they are left out.)
TEMPLATE = [(0.426, -9.2), (0.512, -3.6), (0.532, -10.3), (0.554, -6.9), (0.616, -2.6),
            (0.686, -7.1), (0.756, -6.1), (0.786, -5.6), (0.816, 0.0), (0.856, -6.3),
            (0.926, -5.8), (0.958, -7.5), (0.986, -2.4), (1.056, -4.6), (1.086, -7.9),
            (1.116, -14.3), (1.374, -26.4)]
BURST = (0.426, 1.116)

# ---- when the panels flip (effect defaults, see settings-schema.json / the shader) ----
WIN_W, WIN_H = 1200, 800       # a typical window
PANEL        = 88              # aperture-panels-panel-size default
LEAD, TRAIL  = 0.25, 0.15      # border style 4 (default) = ahead of and behind the wave
SPREAD       = 0.6
cols = max(1, round(WIN_W / PANEL)); rows = max(1, round(WIN_H / PANEL))
cw, ch = WIN_W / cols, WIN_H / rows
span = 1 - LEAD - TRAIL
waves = [math.hypot((cx + .5) * cw - WIN_W / 2, (cy + .5) * ch - WIN_H / 2) /
         math.hypot(WIN_W / 2, WIN_H / 2)                      # wave shape 4: ripple from centre
         for cy in range(rows) for cx in range(cols)]
flip_from = (LEAD + min(waves) * SPREAD * span) * DUR_MS / 1000                       # first panel starts
flip_to   = (LEAD + max(waves) * SPREAD * span + (1 - SPREAD) * span) * DUR_MS / 1000  # last one lands

scale = (flip_to - flip_from) / (BURST[1] - BURST[0])
def to_file_time(t):
    return flip_from + (t - BURST[0]) * scale - LEAD_IN

# ---- samples ----
SR = 44100
def load(f):
    w = wave.open(os.path.join(HERE, f))
    x = array.array("h", w.readframes(w.getnframes()))
    if sys.byteorder == "big": x.byteswap()
    return [v / 32768 for v in x], w.getframerate()
s1, s2 = load("ui_menu_flip_single_01.wav"), load("ui_menu_flip_single_02.wav")
HIT = 0.036   # main transient of both samples is ~36 ms in

total = int(LENGTH * SR)
L = [0.0] * total; R = [0.0] * total
def place(sample, t, gain, pan, pitch):
    data, src_sr = sample
    step = pitch * src_sr / SR
    i0 = int(round((t - HIT / pitch) * SR))
    a = (pan + 1) * math.pi / 4                     # constant-power pan, keep some centre
    gl = gain * (math.cos(a) * 0.8 + 0.2); gr = gain * (math.sin(a) * 0.8 + 0.2)
    for k in range(int((len(data) - 1) / step)):
        i = i0 + k
        if i < 0 or i >= total: continue
        p = k * step; j = int(p); f = p - j
        v = data[j] + (data[j + 1] - data[j]) * f
        L[i] += v * gl; R[i] += v * gr

placed = 0
for t, db in TEMPLATE:
    ft = to_file_time(t) + rng.gauss(0, 0.005) * scale
    if ft < 0.005 or ft > LENGTH - 0.02:
        continue                                    # falls outside the file
    s = s2 if rng.random() < 0.6 else s1
    place(s, ft, 10 ** ((db + rng.uniform(-1.5, 1.5)) / 20), rng.uniform(-0.7, 0.7),
          rng.uniform(0.94, 1.04))
    placed += 1

# ---- level and fades ----
peak = max(max(map(abs, L)), max(map(abs, R))) + 1e-12
out_gain = 10 ** (-1.0 / 20)                        # -1 dBFS peak
fi, fo = int(0.003 * SR), int(0.04 * SR)
pcm = array.array("h")
for i in range(total):
    g = out_gain / peak
    if i < fi: g *= i / fi
    if i >= total - fo: g *= ((total - i) / fo) ** 2
    pcm.append(int(max(-1.0, min(1.0, L[i] * g)) * 32767))
    pcm.append(int(max(-1.0, min(1.0, R[i] * g)) * 32767))
if sys.byteorder == "big": pcm.byteswap()
w = wave.open(OUT, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes(pcm.tobytes()); w.close()
print(f"{OUT}: {LENGTH:.3f}s (from {LEAD_IN:.3f}s), {placed} clacks, burst on the flips at "
      f"{flip_from:.3f}-{flip_to:.3f}s of a {DUR_MS:.0f} ms animation")
