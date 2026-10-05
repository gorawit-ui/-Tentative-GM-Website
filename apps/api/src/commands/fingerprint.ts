// What a command ID stands for (S08, Part 6 §6.6 “Idempotency-Key + actor + payload hash”).
import { createHash } from 'node:crypto';
import { canonicalJson } from '@gm/contracts';

/** SHA-256 (hex) of canonical JSON of actor, command type and payload; the command ID is the key. */
export function commandFingerprint(
  actorId: string,
  command: { readonly type: string; readonly payload: unknown },
): string {
  return createHash('sha256')
    .update(canonicalJson({ actor_id: actorId, type: command.type, payload: command.payload }))
    .digest('hex');
}
