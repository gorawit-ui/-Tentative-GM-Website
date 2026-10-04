/* Shared mapping for v3, or v4 with explicit @config. Pin dependencies in Part 6. */
const tokens = require('./tokens.json');
const color = (name) => `rgb(var(--gm-${name}) / <alpha-value>)`;
const cssVar = (name) => `var(--gm-${name})`;
const status = Object.fromEntries(Object.keys(tokens.status_labels).map((key) => {
  const name = key.replaceAll('_', '-');
  return [key, Object.fromEntries(['base', 'fg', 'bg'].map((part) => [part, color(`status-${name}-${part}`)]))];
}));
const fontSize = Object.fromEntries(Object.keys(tokens.font.sizes).map((key) => [key, [cssVar(`font-size-${key}`), {
  lineHeight: cssVar(`line-height-${key.startsWith('h') ? 'heading' : key === 'metric' ? 'metric' : key === 'caption' ? 'label' : 'body'}`),
  fontWeight: key.startsWith('h') || key === 'metric' ? '600' : '400'
}]]));

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: Object.fromEntries(Object.entries(tokens.breakpoints).map(([k,v]) => [k, `${v}px`])),
    extend: {
      colors: {
        canvas: color('canvas'), surface: {DEFAULT: color('surface'), muted: color('surface-muted')},
        ink: {DEFAULT: color('text'), muted: color('text-muted')},
        line: {DEFAULT: color('border'), control: color('control-border')},
        brand: {DEFAULT: color('brand-solid'), base: color('brand-base'), fg: color('brand-fg'), soft: color('brand-soft'), hover: color('brand-hover'), active: color('brand-active')},
        'on-brand': color('on-brand'), focus: color('focus'),
        info: {DEFAULT: color('info-solid'), fg: color('info-fg'), soft: color('info-soft')}, 'on-info': color('on-info'),
        warning: {fg: color('warning-fg'), soft: color('warning-soft')},
        danger: {DEFAULT: color('danger-solid'), fg: color('danger-fg'), soft: color('danger-soft'), hover: color('danger-hover'), active: color('danger-active')}, 'on-danger': color('on-danger'),
        disabled: {bg: color('disabled-bg'), fg: color('disabled-fg')},
        progress: {track: color('progress-track')}, skeleton: {base: color('skeleton-base'), highlight: color('skeleton-highlight')}, status
      },
      fontFamily: {sans: tokens.font.family}, fontSize,
      spacing: Object.fromEntries(Object.keys(tokens.spacing).map((k) => [k, cssVar(`space-${k}`)])),
      borderRadius: Object.fromEntries(Object.keys(tokens.radius).map((k) => [k, cssVar(`radius-${k}`)])),
      borderWidth: {DEFAULT: cssVar('border-width-default'), emphasis: cssVar('border-width-emphasis')},
      boxShadow: Object.fromEntries(Object.keys(tokens.shadow).map((k) => [k, cssVar(`shadow-${k}`)])),
      minHeight: {touch: cssVar('touch-min'), control: cssVar('control-min')}, minWidth: {touch: cssVar('touch-min')},
      maxWidth: {form: cssVar('form-max'), content: cssVar('content-max')},
      width: {sidebar: cssVar('sidebar'), 'board-column': cssVar('board-column')},
      transitionDuration: Object.fromEntries(Object.keys(tokens.motion.duration_ms).map((k) => [k, cssVar(`duration-${k}`)])),
      transitionTimingFunction: {'gm-out': cssVar('ease-out'), 'gm-standard': cssVar('ease-standard')},
      zIndex: Object.fromEntries(Object.entries(tokens.z_index).map(([k,v]) => [k, String(v)]))
    }
  },
  plugins: []
};
