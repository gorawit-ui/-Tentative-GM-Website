// A03 stub — implemented after the failing tests are committed.
import type { PeopleDirectory, RoutingDirectory } from '@gm/api/commands';
import type { JobHandler } from '../scheduled-work';

export function autoCloseJob(_directories: { readonly peopleDirectory: PeopleDirectory; readonly routingDirectory: RoutingDirectory }): JobHandler {
  return () => Promise.reject(new Error('not implemented'));
}
