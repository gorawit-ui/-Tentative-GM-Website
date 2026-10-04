#!/usr/bin/env python3
"""Generate CSS, motion tokens, contrast reports and a static palette. Python stdlib only."""
from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parent
T = json.loads((ROOT / 'tokens.json').read_text(encoding='utf-8'))

def rgb(value):
    return tuple(int(value[i:i+2], 16) for i in (1, 3, 5))

def luminance(value):
    channels = [v / 255 for v in rgb(value)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(a * b for a, b in zip(linear, (.2126, .7152, .0722)))

def contrast(a, b):
    x, y = sorted((luminance(a), luminance(b)))
    return (y + .05) / (x + .05)

def flatten(theme):
    result = {k: v for k, v in theme.items() if k != 'status'}
    for status, parts in theme['status'].items():
        for part, value in parts.items():
            result[f'status-{status.replace("_", "-")}-{part}'] = value
    return result

def variables(values):
    return '\n'.join(f'  --gm-{k}: {v};' for k, v in values.items())

def css_tokens():
    css = ['/* Generated from tokens.json. Do not edit generated values directly. */']
    for name, theme in T['themes'].items():
        selector = ':root, [data-theme="light"]' if name == 'light' else '[data-theme="dark"]'
        values = {k: ' '.join(map(str, rgb(v))) for k, v in flatten(theme).items()}
        css.append(selector + ' {\n' + variables(values) + '\n}')
    values = {'font-family': ', '.join(f'"{x}"' if ' ' in x else x for x in T['font']['family'])}
    values.update({f'font-size-{k}': f'{v / 16:g}rem' for k, v in T['font']['sizes'].items()})
    values.update({f'line-height-{k}': str(v) for k, v in T['font']['line_heights'].items()})
    values.update({f'font-weight-{k}': str(v) for k, v in T['font']['weights'].items()})
    for section, prefix in [('spacing', 'space'), ('radius', 'radius'), ('border_width', 'border-width')]:
        values.update({f'{prefix}-{k}': f'{v}px' for k, v in T[section].items()})
    values.update({k: f'{v}px' for k, v in T['layout'].items()})
    values.update({f'shadow-{k}': v for k, v in T['shadow'].items()})
    values.update({f'z-{k}': str(v) for k, v in T['z_index'].items()})
    values.update({f'duration-{k}': f'{v}ms' for k, v in T['motion']['duration_ms'].items()})
    values['ease-out'] = 'cubic-bezier(' + ', '.join(map(str, T['motion']['ease_out'])) + ')'
    values['ease-standard'] = 'cubic-bezier(' + ', '.join(map(str, T['motion']['ease_standard'])) + ')'
    css.append(':root {\n' + variables(values) + '\n}')
    css.append('''
/* Color values are RGB channels: always use rgb(var(--gm-...)). */
* { box-sizing: border-box; }
html { font-size: 100%; }
body { margin: 0; color: rgb(var(--gm-text)); background: rgb(var(--gm-canvas)); font: var(--gm-font-size-body)/var(--gm-line-height-body) var(--gm-font-family); }
button, input, textarea, select { font: inherit; }
button, [role="button"], input, select { touch-action: manipulation; }
:focus-visible { outline: var(--gm-border-width-focus) solid rgb(var(--gm-focus)); outline-offset: var(--gm-focus-offset); }
a { color: rgb(var(--gm-info-fg)); text-underline-offset: 3px; }
.gm-link { text-decoration: underline; }
.gm-muted, .gm-neutral-update { color: rgb(var(--gm-text-muted)); }
.gm-card { padding: var(--gm-space-4); background: rgb(var(--gm-surface)); color: rgb(var(--gm-text)); border: 1px solid rgb(var(--gm-border)); border-radius: var(--gm-radius-card); box-shadow: var(--gm-shadow-card); }
.gm-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--gm-space-2); min-width: var(--gm-touch-min); min-height: var(--gm-control-min); padding: var(--gm-space-2) var(--gm-space-4); border: 1px solid transparent; border-radius: var(--gm-radius-control); font-weight: var(--gm-font-weight-medium); line-height: var(--gm-line-height-label); cursor: pointer; transition: background-color var(--gm-duration-fast) var(--gm-ease-out), border-color var(--gm-duration-fast) var(--gm-ease-out); }
.gm-btn--primary { background: rgb(var(--gm-brand-solid)); color: rgb(var(--gm-on-brand)); }
.gm-btn--primary:hover { background: rgb(var(--gm-brand-hover)); }
.gm-btn--primary:active { background: rgb(var(--gm-brand-active)); }
.gm-btn--secondary { background: rgb(var(--gm-surface)); color: rgb(var(--gm-text)); border-color: rgb(var(--gm-control-border)); }
.gm-btn--secondary:hover { background: rgb(var(--gm-surface-muted)); }
.gm-btn--secondary:active { background: rgb(var(--gm-canvas)); }
.gm-btn--danger { background: rgb(var(--gm-danger-solid)); color: rgb(var(--gm-on-danger)); }
.gm-btn--danger:hover { background: rgb(var(--gm-danger-hover)); }
.gm-btn--danger:active { background: rgb(var(--gm-danger-active)); }
.gm-btn:disabled, .gm-btn[aria-disabled="true"] { background: rgb(var(--gm-disabled-bg)); color: rgb(var(--gm-disabled-fg)); border-color: rgb(var(--gm-control-border)); cursor: not-allowed; opacity: 1; }
.gm-input { width: 100%; min-height: var(--gm-control-min); padding: var(--gm-space-3); background: rgb(var(--gm-surface)); color: rgb(var(--gm-text)); border: 1px solid rgb(var(--gm-control-border)); border-radius: var(--gm-radius-control); }
.gm-input::placeholder { color: rgb(var(--gm-text-muted)); opacity: 1; }
.gm-input[aria-invalid="true"] { border: 2px solid rgb(var(--gm-danger-fg)); }
.gm-error { color: rgb(var(--gm-danger-fg)); }
.gm-badge { display: inline-flex; align-items: center; gap: var(--gm-space-2); padding: var(--gm-space-1) var(--gm-space-3); border-radius: var(--gm-radius-pill); font-size: var(--gm-font-size-body); line-height: var(--gm-line-height-label); font-weight: var(--gm-font-weight-medium); color: var(--badge-fg); background: var(--badge-bg); }
.gm-status-dot { width: 10px; height: 10px; flex: 0 0 10px; border-radius: 50%; background: var(--badge-base); border: 2px solid var(--badge-fg); }
.gm-badge--info { --badge-fg: rgb(var(--gm-info-fg)); --badge-bg: rgb(var(--gm-info-soft)); }
.gm-badge--warning { --badge-fg: rgb(var(--gm-warning-fg)); --badge-bg: rgb(var(--gm-warning-soft)); }
.gm-badge--danger { --badge-fg: rgb(var(--gm-danger-fg)); --badge-bg: rgb(var(--gm-danger-soft)); }
/* Mount stale treatment only for authorized GM views; CSS is not authorization. */
.gm-stale { border: 2px solid rgb(var(--gm-warning-fg)); }
.gm-stale-label { color: rgb(var(--gm-warning-fg)); }
.gm-progress { height: 8px; overflow: hidden; border-radius: var(--gm-radius-pill); background: rgb(var(--gm-progress-track)); }
.gm-progress__fill { height: 100%; background: rgb(var(--gm-info-solid)); transition: width var(--gm-duration-fast) var(--gm-ease-out); }
.gm-chart-mark { stroke: rgb(var(--gm-chart-outline)); stroke-width: 2px; }
.gm-skeleton { background: linear-gradient(90deg, rgb(var(--gm-skeleton-base)) 25%, rgb(var(--gm-skeleton-highlight)) 50%, rgb(var(--gm-skeleton-base)) 75%); background-size: 200% 100%; animation: gm-shimmer var(--gm-duration-skeleton) linear __GM_SKELETON_ITERATIONS__; }
.gm-new-highlight { animation: gm-new-highlight var(--gm-duration-highlight) var(--gm-ease-out) 1; }
.gm-bottom-nav { position: fixed; inset: auto 0 0; z-index: var(--gm-z-nav); display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); min-height: calc(var(--gm-bottom-nav) + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); background: rgb(var(--gm-surface)); border-top: 1px solid rgb(var(--gm-border)); }
.gm-bottom-nav a { min-height: var(--gm-touch-min); min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 2px; color: rgb(var(--gm-text-muted)); text-decoration: none; font-size: var(--gm-font-size-caption); line-height: var(--gm-line-height-label); }
.gm-bottom-nav a[aria-current="page"] { color: rgb(var(--gm-brand-fg)); font-weight: 600; text-decoration: underline; text-underline-offset: 4px; }
.gm-bottom-nav a.gm-nav-repair, .gm-bottom-nav a.gm-nav-repair[aria-current="page"] { color: rgb(var(--gm-on-brand)); background: rgb(var(--gm-brand-solid)); border-radius: var(--gm-radius-control); margin: 8px 2px; }
.gm-with-bottom-nav { padding-bottom: calc(var(--gm-bottom-nav) + env(safe-area-inset-bottom, 0px) + var(--gm-space-4)); }
@keyframes gm-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes gm-new-highlight { from { box-shadow: 0 0 0 2px rgb(var(--gm-info-fg)); } to { box-shadow: 0 0 0 2px rgb(var(--gm-info-fg) / 0); } }
@media (min-width: __GM_DESKTOP_BREAKPOINT__px) { .gm-bottom-nav { display: none; } .gm-with-bottom-nav { padding-bottom: 0; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } .gm-skeleton { background: rgb(var(--gm-skeleton-base)); } }
'''.replace('__GM_SKELETON_ITERATIONS__', str(T['motion']['skeleton_iterations'])).replace('__GM_DESKTOP_BREAKPOINT__', str(T['breakpoints']['lg'])))
    for key in T['status_labels']:
        n = key.replace('_', '-')
        css.append(f'.gm-badge[data-status="{key}"] {{ --badge-fg: rgb(var(--gm-status-{n}-fg)); --badge-bg: rgb(var(--gm-status-{n}-bg)); --badge-base: rgb(var(--gm-status-{n}-base)); }}')
    return '\n'.join(css) + '\n'

def motion_code():
    data = json.dumps(T['motion'], ensure_ascii=False, indent=2)
    return '''// Generated from tokens.json. CSS/chart durations are ms; Motion transitions are seconds.
export const motionTokens = ''' + data + ''' as const;

export function getMotionSettings(reducedMotion: boolean) {
  const seconds = (ms: number) => reducedMotion ? 0 : ms / 1000;
  const tween = (ms: number) => ({ type: 'tween' as const, duration: seconds(ms), ease: motionTokens.ease_out });
  return {
    page: {
      initial: reducedMotion ? false : { opacity: 0, y: motionTokens.page_offset_px },
      animate: { opacity: 1, y: 0 },
      exit: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -motionTokens.page_offset_px },
      transition: tween(motionTokens.duration_ms.enter)
    },
    newCard: {
      initial: reducedMotion ? false : { opacity: 0, y: motionTokens.card_offset_px },
      animate: { opacity: 1, y: 0 }, transition: tween(motionTokens.duration_ms.enter)
    },
    layout: { enabled: !reducedMotion, transition: tween(motionTokens.duration_ms.layout) },
    drag: { momentum: false, transition: reducedMotion ? tween(0) : { type: 'spring' as const, ...motionTokens.drag_spring } },
    status: { transition: tween(motionTokens.duration_ms.base), crossfadeText: false },
    check: { animatePath: !reducedMotion, transition: tween(motionTokens.duration_ms.enter) },
    chart: { isAnimationActive: !reducedMotion, animationDuration: reducedMotion ? 0 : motionTokens.duration_ms.chart, animationEasing: 'ease-out' as const },
    countup: { enabled: !reducedMotion, durationMs: reducedMotion ? 0 : motionTokens.duration_ms.countup },
    highlight: { enabled: !reducedMotion, durationMs: reducedMotion ? 0 : motionTokens.duration_ms.highlight },
    skeleton: { durationMs: reducedMotion ? 0 : motionTokens.duration_ms.skeleton, iterations: reducedMotion ? 0 : motionTokens.skeleton_iterations }
  };
}
'''

def audit():
    required, references = [], []
    def add(target, theme, use, fg, bg, minimum):
        r = contrast(fg, bg)
        target.append(dict(theme=theme, use=use, foreground=fg, background=bg, ratio=r, threshold=minimum, passed=r >= minimum))
    for mode, t in T['themes'].items():
        surfaces = [t[k] for k in ['canvas', 'surface', 'surface-muted']]
        softs = [t['brand-soft'], t['info-soft'], t['warning-soft'], t['danger-soft']] + [v['bg'] for v in t['status'].values()]
        for key in ['text', 'text-muted']:
            for i, bg in enumerate(surfaces + softs):
                add(required, mode, f'{key}/approved-surface-{i+1}', t[key], bg, 4.5)
        for i, bg in enumerate(surfaces + [t['brand-soft']]):
            add(required, mode, f'brand-fg/surface-{i+1}', t['brand-fg'], bg, 4.5)
        for semantic in ['info', 'warning', 'danger']:
            for i, bg in enumerate(surfaces + [t[f'{semantic}-soft']]):
                add(required, mode, f'{semantic}-fg/surface-{i+1}', t[f'{semantic}-fg'], bg, 4.5)
        for key, values in t['status'].items():
            add(required, mode, f'status.{key}.fg/bg', values['fg'], values['bg'], 4.5)
            for i, bg in enumerate(surfaces):
                add(required, mode, f'status.{key}.fg/surface-{i+1}', values['fg'], bg, 4.5)
        for kind in ['brand', 'danger']:
            for state in ['solid', 'hover', 'active']:
                add(required, mode, f'on-{kind}/{kind}-{state}', t[f'on-{kind}'], t[f'{kind}-{state}'], 4.5)
        add(required, mode, 'on-info/info-solid', t['on-info'], t['info-solid'], 4.5)
        add(required, mode, 'disabled-fg/disabled-bg (project target)', t['disabled-fg'], t['disabled-bg'], 4.5)
        for i, bg in enumerate(surfaces):
            add(required, mode, f'control-border/surface-{i+1}', t['control-border'], bg, 3)
        for i, bg in enumerate(surfaces + softs):
            add(required, mode, f'focus/offset-surface-{i+1}', t['focus'], bg, 3)
        add(required, mode, 'progress-fill/track', t['info-solid'], t['progress-track'], 3)
        for key, v in t['status'].items():
            add(required, mode, f'chart-outline/{key}-fill', t['chart-outline'], v['base'], 3)
        if mode == 'light':
            for i, bg in enumerate(surfaces):
                add(required, mode, f'chart-outline/surface-{i+1}', t['chart-outline'], bg, 3)
        else:
            for key, v in t['status'].items():
                for i, bg in enumerate(surfaces):
                    add(required, mode, f'chart.{key}.base/dark-surface-{i+1}', v['base'], bg, 3)
    original = {'brand-base': '#5B7F3A', **{k: v['base'] for k,v in T['themes']['light']['status'].items()}}
    for k, fg in original.items():
        for name, bg in [('white', '#FFFFFF'), ('cream', '#FAF8F3')]:
            add(references, 'original', f'{k}/{name} text', fg, bg, 4.5)
            add(references, 'original', f'{k}/{name} essential graphic', fg, bg, 3)
    failures = [x for x in required if not x['passed']]
    report = dict(method='WCAG sRGB relative luminance; threshold 0.04045; pass before rounding',
                  summary=dict(required=len(required), passed=len(required)-len(failures), failed=len(failures), reference_only=len(references)),
                  required_pairs=required, reference_pairs=references)
    return report

def report_md(report):
    s = report['summary']
    lines = ['# GM design tokens — Contrast report', '', 'Generated from `tokens.json`. Ratios shown to four decimals; pass/fail uses the unrounded number.', '',
             f'Required pairs: **{s["passed"]}/{s["required"]} pass**. Reference-only pairs: {s["reference_only"]}.', '',
             'Normal text ≥ 4.5:1; required controls/graphics ≥ 3:1. Disabled text uses a voluntary project target of 4.5:1. Decorative borders are not input boundaries.', '',
             'This is a token audit, not certification of a rendered application. Only the listed combinations are approved; custom opacity/gradients/overlays need another check.', '',
             'Method: sRGB channels /255 → linear (c/12.92 if c ≤ 0.04045; otherwise ((c+0.055)/1.055)^2.4). L = 0.2126R + 0.7152G + 0.0722B. Contrast = (lighter L + 0.05)/(darker L + 0.05).', '',
             'Sources: [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).', '']
    for heading, rows in [('Required pairs', report['required_pairs']), ('Original colors — reference only, failures retained', report['reference_pairs'])]:
        lines += ['## ' + heading, '', '| Theme | Usage | Foreground | Background | Ratio | Minimum | Result |', '|---|---|---|---|---:|---:|---|']
        for x in rows:
            lines.append(f'| {x["theme"]} | {x["use"]} | {x["foreground"]} | {x["background"]} | {x["ratio"]:.4f}:1 | {x["threshold"]}:1 | {"PASS" if x["passed"] else "FAIL"} |')
        lines.append('')
    return '\n'.join(lines)

def preview(css):
    panels = []
    for mode, theme in T['themes'].items():
        cards = []
        for key, v in theme['status'].items():
            ratio = contrast(v['fg'], v['bg'])
            cards.append(f'<article class="gm-card"><span class="gm-badge" data-status="{key}"><span class="gm-status-dot" aria-hidden="true"></span>{T["status_labels"][key]}</span><p><code>{key}</code></p><p>ตัวอักษร {v["fg"]}<br>พื้นป้าย {v["bg"]}<br>contrast <strong>{ratio:.2f}:1</strong></p><svg viewBox="0 0 160 30" aria-label="ตัวอย่างแถบสีพร้อมเส้นขอบ" role="img"><rect x="2" y="2" width="150" height="24" rx="4" fill="{v["base"]}" class="gm-chart-mark"/></svg></article>')
        panels.append(f'<section data-theme="{mode}" class="theme-panel"><h2>{"Light · Phase 1" if mode == "light" else "Dark · เตรียม token เท่านั้น"}</h2><div class="grid">' + ''.join(cards) + '</div><div class="gm-card sample"><h3>ตัวอย่างปุ่มและฟอร์ม</h3><div class="actions"><button class="gm-btn gm-btn--primary" type="button">แจ้งซ่อม</button><button class="gm-btn gm-btn--secondary" type="button">ติดตามแล้ว</button><button class="gm-btn gm-btn--danger" type="button">ยกเลิกงาน</button><button class="gm-btn" disabled>กำลังบันทึก</button></div><p><label for="field-' + mode + '">ชื่อบนบอร์ด</label><input class="gm-input" id="field-' + mode + '" value="แอร์ — ห้องแพ็คชั้น 1 · WH300"></p><p class="gm-neutral-update">อัปเดตล่าสุด 2 วันทำการที่แล้ว</p><p><span class="gm-badge gm-badge--info">ฝ่ายที่รอตอบกลับแล้ว</span></p><p class="gm-muted">ตัวอย่างสีและการจัดข้อความ — ปุ่มในหน้านี้ไม่มีการบันทึกข้อมูล</p></div></section>')
    return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GM Design Tokens · Part 4</title><style>@layer theme, base, components, utilities; @layer components {' + css + '''
main { max-width: 1400px; margin: auto; padding: 24px 16px; } h1 { font-size: clamp(24px,4vw,32px); line-height: 1.35; } h2,h3 { line-height: 1.35; } .theme-panel { color: rgb(var(--gm-text)); background: rgb(var(--gm-canvas)); border-radius: 16px; padding: 24px 16px; margin: 24px 0; } .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(210px,100%),1fr)); gap: 16px; } .actions { display: flex; flex-wrap: wrap; gap: 12px; } .sample { margin-top: 24px; } code { font-size: 14px; overflow-wrap: anywhere; } svg { display: block; max-width: 160px; } input { display: block; margin-top: 8px; } p { margin-block: 12px; }
}</style></head><body><main><h1>GM One Stop Service — Design tokens</h1><p>ชุดสีจริงและตัวอย่างองค์ประกอบของ Part 4 · ไม่มีข้อมูลบริษัทหรือการเชื่อม backend ในหน้านี้ · ฟอนต์ใช้ตัวที่ติดตั้งในเครื่อง</p>''' + ''.join(panels) + '</main></body></html>'

def main():
    assert contrast('#000000', '#FFFFFF') == 21
    assert contrast('#577937', '#577937') == 1
    report = audit()
    (ROOT / 'contrast-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'contrast-report.md').write_text(report_md(report), encoding='utf-8')
    failures = [x for x in report['required_pairs'] if not x['passed']]
    if failures:
        raise SystemExit('Required contrast failures: ' + json.dumps(failures, ensure_ascii=False))
    css = css_tokens()
    (ROOT / 'tokens.css').write_text(css, encoding='utf-8')
    (ROOT / 'motion-tokens.ts').write_text(motion_code(), encoding='utf-8')
    (ROOT / 'token-preview.html').write_text(preview(css), encoding='utf-8')
    print(json.dumps(report['summary']))

if __name__ == '__main__':
    main()
