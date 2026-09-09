from pathlib import Path
from math import sin, cos, pi
from concurrent.futures import ProcessPoolExecutor
from itertools import repeat
import argparse
import html

import cairosvg

INK = '#15161d'
CREAM = '#f7f4ee'
GOLD = '#e5b65b'
BODY = 'M46 24C37 24 32 28 26 28C23 28 24 32 22 35C20 41 15 44 11 43C8 42 9 47 7 51C1 65 6 82 20 89C35 97 54 94 68 85C82 76 87 61 80 46C74 32 61 24 46 24Z'
FPS = 30
SECONDS = 6
N = FPS * SECONDS


def smooth(x):
    x = max(0, min(1, x))
    return x * x * (3 - 2 * x)


def keyframes(t, values):
    for (start, a), (end, b) in zip(values, values[1:]):
        if start <= t <= end:
            return a + (b - a) * smooth((t - start) / (end - start))
    return values[-1][1]


def blink(t, center, duration):
    distance = abs(t - center)
    return smooth(1 - distance / duration) if distance < duration else 0


def state(t):
    t %= 1
    closure = max(blink(t, .375, .029), blink(t, .865, .032))
    return {
        'angle': keyframes(t, [(0, 0), (.08, 0), (.24, -5), (.35, -5), (.52, 4), (.65, 4), (.83, 0), (1, 0)]),
        'gaze': keyframes(t, [(0, 0), (.1, 0), (.19, -2.5), (.34, -2.5), (.43, 2.2), (.64, 2.2), (.77, 0), (1, 0)]),
        'open': 1 - .95 * closure,
        'bob': -.85 * sin(4 * pi * t),
        'antenna': 3.8 * sin(4 * pi * t) - 1.1 * sin(2 * pi * t),
        'pulse': (t * 2) % 1,
    }


def mark(t, name, color=INK):
    s = state(t)
    pulse_opacity = .22 * sin(pi * s['pulse']) ** 2
    pulse_radius = 6.4 + 7.5 * s['pulse']
    eyes = []
    for label, cx, cy, radius, angle in [('l', 35, 56, 8.8, -9), ('r', 63, 53, 7.8, 0)]:
        eyes.append(f'''<g transform="rotate({angle} {cx} {cy})">
          <defs><clipPath id="{name}-{label}"><rect x="{cx-radius+1}" y="{cy}" width="{radius*2-2}" height="{radius+1}"/></clipPath></defs>
          <ellipse cx="{cx}" cy="{cy}" rx="{radius}" ry="{radius*s['open']:.4f}" fill="none" stroke="{color}" stroke-width="2.9"/>
          <ellipse cx="{cx+s['gaze']:.4f}" cy="{cy+1.8*s['open']:.4f}" rx="3.5" ry="{3.7*s['open']:.4f}" clip-path="url(#{name}-{label})" fill="{color}"/>
          <path d="M{cx-radius} {cy}H{cx+radius}" stroke="{color}" stroke-width="2.9"/>
        </g>''')
    return f'''<g transform="translate(0 {s['bob']:.4f}) rotate({s['angle']:.4f} 46 61)" stroke-linecap="round" stroke-linejoin="round">
      <g transform="rotate({s['antenna']:.4f} 57 27)">
        <circle cx="74" cy="11" r="{pulse_radius:.4f}" fill="none" stroke="{GOLD}" stroke-width="1.7" opacity="{pulse_opacity:.4f}"/>
        <path d="M57 27C58 18 64 12 72 11" fill="none" stroke="{color}" stroke-width="4.6"/>
        <circle cx="74" cy="11" r="5.6" fill="{GOLD}"/>
      </g>
      <path d="{BODY}" fill="none" stroke="{color}" stroke-width="4.5"/>
      <path d="M23 71C17 73 17 79 22 81C26 83 29 80 30 78C24 81 19 76 23 71Z" fill="{color}"/>
      {''.join(eyes)}
      <path d="M47 67Q52 71 57 66" fill="none" stroke="{color}" stroke-width="2.9"/>
    </g>'''


def text(value, x, y, size=14, color=INK, weight=400, spacing=0):
    return f'<text x="{x}" y="{y}" font-family="Inter, Arial, sans-serif" font-size="{size}" font-weight="{weight}" letter-spacing="{spacing}" fill="{color}">{html.escape(value)}</text>'


def ellipsis(t, x, y, r=2, color=GOLD, gap=9):
    parts = []
    for i in range(3):
        a = (1 + cos(2 * pi * (t * 3 - i * .17))) / 2
        parts.append(f'<circle cx="{x+i*gap}" cy="{y-1.7*a:.4f}" r="{r}" fill="{color}" opacity="{.28+.72*a:.4f}"/>')
    return ''.join(parts)


def placed_mark(t, name, x, y, size, color=INK):
    return f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="-7 -7 114 114" overflow="visible">{mark(t, name, color)}</svg>'


def frame(t):
    parts = [f'<rect width="1400" height="920" fill="{CREAM}"/>']
    parts.append(text('MOONLET / MOTION STUDY 01', 70, 57, 12, '#858176', spacing=1.9))
    parts.append(text('THINKING STATE', 1170, 57, 12, '#858176', spacing=1.6))
    parts.append('<path d="M70 83H1330" stroke="#dedad1"/>')
    parts.append(text('A little thought in motion.', 70, 140, 36, INK, 600, -1.25))
    parts.append(text('The approved mark, brought to life without becoming a distraction.', 70, 177, 16, '#777268'))
    parts.append(placed_mark(t, 'hero', 187, 265, 330))
    parts.append(text('Thinking', 287, 665, 23, '#6e695f', 500, -.4))
    parts.append(ellipsis(t, 389, 658, 2.4, GOLD, 10))
    parts.append(text('SIX-SECOND SEAMLESS LOOP', 235, 729, 11, '#928b7e', spacing=1.3))
    parts.append('<path d="M670 245V763" stroke="#dedad1"/>')
    parts.append(text('IN THE CONVERSATION', 738, 265, 11, '#928b7e', spacing=1.5))
    parts.append('<rect x="736" y="297" width="570" height="284" rx="22" fill="#fff" stroke="#e1ddd5"/>')
    parts.append(text('Conversation', 762, 333, 13, '#777268', 500))
    parts.append('<path d="M922 355H1255Q1276 355 1276 376V395Q1276 411 1267 413H922Q904 413 904 395V374Q904 355 922 355Z" fill="#15161d"/>')
    parts.append(text('Can you explain what changed?', 925, 390, 15, CREAM))
    parts.append('<path d="M780 437H937Q955 437 955 455V481Q955 499 937 499H769L763 493V455Q763 437 780 437Z" fill="#fff" stroke="#e6e3de"/>')
    parts.append(placed_mark(t, 'chat', 775, 444, 40))
    parts.append(text('thinking', 829, 475, 14, '#8e887d'))
    parts.append(ellipsis(t, 890, 471, 1.6, GOLD, 6.7))
    parts.append(text('40px mark · stable bubble width · no layout shift', 763, 547, 12, '#928b7e'))
    parts.append('<rect x="736" y="612" width="570" height="129" rx="22" fill="#15161d"/>')
    parts.append(text('ON DARK', 762, 640, 10, '#92918d', spacing=1.4))
    parts.append(placed_mark(t, 'dark', 773, 662, 40, CREAM))
    parts.append(text('thinking', 830, 691, 14, '#cecbc3'))
    parts.append(ellipsis(t, 891, 687, 1.6, GOLD, 6.7))
    parts.append('<path d="M70 823H1330" stroke="#dedad1"/>')
    parts.append(text('A soft tilt. A wandering glance. A blink. A warm signal.', 70, 864, 13, '#777268'))
    parts.append(text('Animation preview — not yet applied to the app', 1020, 864, 11, '#928b7e'))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="920" viewBox="0 0 1400 920">{"".join(parts)}</svg>'


def icon(t):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-7 -7 114 114"><rect x="-7" y="-7" width="114" height="114" fill="{CREAM}"/>{mark(t, "icon")}</svg>'


def render(i, output):
    t = i / N
    cairosvg.svg2png(bytestring=frame(t).encode(), write_to=str(output / 'frames' / f'{i:03}.png'))
    cairosvg.svg2png(bytestring=icon(t).encode(), write_to=str(output / 'icon-frames' / f'{i:03}.png'))
    return i


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Render the approved Moonlet thinking-animation source into PNG frames.')
    parser.add_argument('output', type=Path, help='Output directory for generated frames, preferably outside the repository.')
    output = parser.parse_args().output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for folder in ['frames', 'icon-frames']:
        (output / folder).mkdir(exist_ok=True)
    assert state(0) == state(1)
    assert mark(0, 'test') == mark(1, 'test')
    (output / 'poster.svg').write_text(frame(0))
    with ProcessPoolExecutor(max_workers=4) as pool:
        list(pool.map(render, range(N), repeat(output)))
    print(f'Rendered {N} frames at {FPS}fps: one {SECONDS}-second seamless cycle, plus icon-only frames.')
