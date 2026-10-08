// The API matrix must agree with the Rules matrix wherever both talk about the same data.
import { describe, expect, it } from 'vitest';
import { ACTIVE_SUBJECTS, SUBJECT_KEYS, decide } from './acl-matrix';
import { API_ENDPOINTS, apiCells, apiDecide } from './api-matrix';

describe('API matrix (S12)', () => {
  it('has a decision for every subject × endpoint', () => {
    expect(apiCells()).toHaveLength(SUBJECT_KEYS.length * API_ENDPOINTS.length);
    expect(new Set(API_ENDPOINTS.map((endpoint) => endpoint.key)).size).toBe(API_ENDPOINTS.length);
  });

  it('detail, history, waiting intervals, comments and view links follow the Rules decision for requests/{id} get', () => {
    for (const subject of SUBJECT_KEYS) {
      for (const [prefix, resource] of [
        ['general', 'requests.general'],
        ['confidential', 'requests.confidential'],
      ] as const) {
        for (const kind of ['request_detail', 'history', 'waiting_intervals', 'comments', 'view_url']) {
          expect(apiDecide(subject, `${kind}.${prefix}`), `${subject} ${kind}.${prefix}`).toBe(decide(subject, resource, 'get'));
        }
      }
    }
  });

  it('nobody outside the active accounts gets anything from the API', () => {
    for (const subject of SUBJECT_KEYS.filter((key) => !ACTIVE_SUBJECTS.includes(key))) {
      expect(API_ENDPOINTS.filter((endpoint) => apiDecide(subject, endpoint.key) === 'allow'), subject).toEqual([]);
    }
  });

  it('a watcher gets the contribution upload and nothing that shows the request detail', () => {
    const allowed = API_ENDPOINTS.filter((endpoint) => apiDecide('watcher', endpoint.key) === 'allow').map((endpoint) => endpoint.key);
    // A06: marking the summary seen shows nothing more than the summary itself.
    expect(allowed).toEqual(['my_requests', 'awaiting_confirmation', 'upload_url.watch_contribution.general', 'mark_seen.general']);
  });
});
