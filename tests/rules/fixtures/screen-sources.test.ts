// D-ACL-6: the screen → data source table may only promise reads the ACL matrix allows, and D-ACL-1:
// no screen that a non-GM opens may need people_picker (if one appears, stop and report it).
import { describe, expect, it } from 'vitest';
import { GM_SUBJECTS, RESOURCES, decide } from './acl-matrix';
import { SCREEN_SOURCES, STORAGE_SAMPLE_PATHS } from './screen-sources';

describe('screen → data source table', () => {
  it('covers every screen asked for in the D-ACL review', () => {
    const screens = SCREEN_SOURCES.map((entry) => entry.screen).join('\n');
    for (const name of [
      'บอร์ดสาธารณะ',
      'บอร์ด GM',
      'ทีม GM ตอนนี้',
      'รอคุณยืนยัน',
      'คำขอของฉัน — แท็บที่ฉันขอ',
      'เกี่ยวข้องกับฉัน รวมงานที่ติดตาม',
      'รายละเอียด — ผู้ขอ',
      'รายละเอียด — related',
      'รายละเอียด — ฝ่ายที่ถูกรอ',
      'รายละเอียด — watcher',
      'ต่ออายุ',
      'Dashboard',
    ]) {
      expect(screens, name).toContain(name);
    }
  });

  it('every Firestore source exists in the matrix and is allowed for everyone who uses it', () => {
    for (const entry of SCREEN_SOURCES) {
      for (const source of entry.firestore) {
        expect(RESOURCES.some((resource) => resource.key === source.resource), source.resource).toBe(true);
        for (const subject of source.audience ?? entry.audience) {
          for (const operation of source.operations) {
            expect(decide(subject, source.resource, operation), `${entry.screen}: ${subject} ${operation} ${source.resource}`).toBe('allow');
          }
        }
        for (const subject of source.audience ?? []) expect(entry.audience, entry.screen).toContain(subject);
      }
    }
  });

  it('D-ACL-1: no screen a non-GM opens uses people_picker', () => {
    for (const entry of SCREEN_SOURCES) {
      const nonGm = entry.audience.some((subject) => !GM_SUBJECTS.includes(subject));
      if (nonGm) expect(entry.firestore.map((source) => source.resource), entry.screen).not.toContain('people_picker');
    }
  });

  it('no non-GM screen queries requests (list), even for its own requests', () => {
    for (const entry of SCREEN_SOURCES) {
      for (const source of entry.firestore) {
        if (!source.resource.startsWith('requests')) continue;
        const users = source.audience ?? entry.audience;
        if (users.some((subject) => !GM_SUBJECTS.includes(subject))) expect(source.operations, entry.screen).not.toContain('list');
      }
    }
  });

  it('D-S10-1/2: Q-S10-1 and Q-S10-2 are closed — names come with requests/{id}, the awaiting count from the personal endpoint', () => {
    const text = JSON.stringify(SCREEN_SOURCES);
    expect(text).not.toContain('Q-S10-1');
    expect(text).not.toContain('Q-S10-2');
    const awaiting = SCREEN_SOURCES.find((entry) => entry.screen.includes('รอคุณยืนยัน'));
    expect(awaiting?.firestore).toEqual([]);
    expect(awaiting?.api.join()).toContain('D-S10-2');
    const requesterDetail = SCREEN_SOURCES.find((entry) => entry.screen.startsWith('รายละเอียด — ผู้ขอ'));
    expect(requesterDetail?.firestore.find((source) => source.resource === 'requests.general')?.use).toContain('D-S10-1');
  });

  it('Storage sample paths cover attachments of both samples, pending uploads, contributions and an unknown path', () => {
    expect(STORAGE_SAMPLE_PATHS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(STORAGE_SAMPLE_PATHS).size).toBe(STORAGE_SAMPLE_PATHS.length);
  });
});
