// A02 — “หนึ่ง production Scheduler config” (SESSION-TASKS A02; Part 6 §6.2: prod Scheduler 1 job
// `*/15 * * * *` Asia/Bangkok; dev uses a manual tick, no paused job). The file describes the job for
// the administrator (P7-INFRA-01); nothing in this repository creates it.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TICK_SCHEDULE } from '@gm/domain';
import { TICK_PATH } from './routes';

const repo = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');

describe('infra/scheduler.json', () => {
  it('holds exactly one job: the prod tick, POST to the private worker with OIDC', () => {
    const config = JSON.parse(read('infra/scheduler.json')) as { jobs: Record<string, unknown>[] };
    expect(config.jobs).toHaveLength(1);
    expect(config.jobs[0]).toMatchObject({
      name: 'gm-tick',
      environment: 'prod',
      schedule: TICK_SCHEDULE.cron,
      time_zone: TICK_SCHEDULE.timeZone,
      http_method: 'POST',
      target_service: 'gm-worker',
      path: TICK_PATH,
      auth: 'oidc',
    });
  });

  it('no other Scheduler config in infra, and the dev deploy wrapper never creates one', () => {
    const files = readdirSync(new URL('infra/', repo), { recursive: true }).map(String);
    expect(files.filter((file) => /schedul/i.test(file))).toEqual(['scheduler.json']);
    expect(read('scripts/deploy-dev.mjs')).not.toMatch(/scheduler/i);
  });
});
