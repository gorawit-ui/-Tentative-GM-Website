// What a command ID stands for (S08) — not implemented yet.
export function commandFingerprint(
  _actorId: string,
  _command: { readonly type: string; readonly payload: unknown },
): string {
  throw new Error('not implemented yet (S08)');
}
