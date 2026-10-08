// A02 — dev manual tick (Part 6 §6.2: “dev manual tick/emulator ไม่สร้าง paused job ทิ้ง”). The
// script only calls a worker on this machine (the emulator suite of `npm run dev`).
import { describe, expect, it } from 'vitest';
import { manualTickUrl } from './manual-tick';

describe('manualTickUrl', () => {
  it('defaults to the local worker of `npm run dev`', () => {
    expect(manualTickUrl({}).href).toBe('http://127.0.0.1:8788/internal/tick');
    expect(manualTickUrl({ PORT: '9100' }).href).toBe('http://127.0.0.1:9100/internal/tick');
    expect(manualTickUrl({ GM_WORKER_URL: 'http://localhost:8788' }).href).toBe('http://localhost:8788/internal/tick');
  });

  it.each(['https://gm-worker-abc-as.a.run.app', 'http://10.0.0.5:8788', 'http://gm-dev.tdfb.co', 'not a url'])('refuses a worker that is not on this machine: %s', (url) => {
    expect(() => manualTickUrl({ GM_WORKER_URL: url })).toThrow();
  });
});
