// A10 — people and roles (Part 3 §13.3, Part 6 §6.4–6.5, D-S08-4, D-A09-1, FU-10, FU-11, FU-38).
//   people/{person_id}        email, name, team_label?, slack_user_id?, role, active, uid?, linked_at?,
//                             last_import_id?                       (the source; server only)
//   people_picker/{person_id} name, team_label?                      (active people; GM read, D-ACL-1)
//   access/{uid}              person_id, role, enabled               (written here from people only)
//   unlisted_logins/{email}   email, uid, first_seen_at, last_seen_at, count (GM Admin through the API)
//   settings/people_import    latest_import_id, imported_at, counts
// The CSV is read in the browser; the API receives mapped rows, checks them again, writes people in
// bounded transactions and keeps only counts of the import (never the rows). Logs carry codes only.
import {
  checkPeopleRows,
  MAX_PERSON_NAME_CHARS,
  MAX_TEAM_LABEL_CHARS,
  type CheckedPerson,
  type PeopleImportBody,
} from '@gm/contracts';
import { LifecycleRejected, ROLES, accessFor, isGmRole, linkDecision, planPersonActive, planPersonRole, type PersonFacts, type Role } from '@gm/domain';
import type { Instant } from '@gm/time';
import { COMMANDS_COLLECTION, COMMAND_EXPIRY_FIELD, COMMAND_RETENTION_MS, CommandRejected } from '../commands/execute-command';
import { releaseAssignmentOf, type LifecycleDirectories } from '../commands/lifecycle';
import { commandFingerprint } from '../commands/fingerprint';
import type { CommandStore, CommandTransaction, StoredData } from '../commands/transaction-port';
import type { ApiDeps } from '../endpoints/deps';
import { fromStored } from '../firestore/admin-store';

export const PEOPLE_IMPORT_PATH = 'settings/people_import';
/** Bounded reads: the whole staff list is a few hundred people. */
export const MAX_PEOPLE = 5000;
export const PEOPLE_PAGE = 50;
export const IMPORT_CHUNK = 100;
export const MAX_UNLISTED = 200;
const MAX_ADMINS = 200;
/** D-A10-2: the open requests of one GM read in the switch-off transaction (a GM holds tens, not hundreds). */
export const MAX_RELEASED_REQUESTS = 300;
/** D-A10-2: statuses whose assignee still works on them (completed waits for the requester). */
export const OPEN_ASSIGNED_STATUSES = ['queued', 'in_progress', 'waiting'] as const;
export const RELEASE_JOB_KIND = 'release_assignments';

const personPath = (personId: string) => `people/${personId}`;
const pickerPath = (personId: string) => `people_picker/${personId}`;
const unlistedPath = (email: string) => `unlisted_logins/${email}`;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);
const roleOf = (value: unknown): Role => ((ROLES as readonly unknown[]).includes(value) ? (value as Role) : 'requester');

export function personFacts(personId: string, stored: StoredData | undefined): PersonFacts | undefined {
  return stored === undefined ? undefined : { personId, role: roleOf(stored.role), active: stored.active === true };
}

/** `people_picker`: name and team of an active person; nothing for one switched off. */
function writePicker(transaction: Pick<CommandTransaction, 'set' | 'delete'>, personId: string, person: StoredData): void {
  if (person.active !== true) {
    transaction.delete(pickerPath(personId));
    return;
  }
  const team = text(person.team_label);
  transaction.set(pickerPath(personId), { name: String(person.name ?? ''), ...(team === undefined ? {} : { team_label: team }) });
}

// ---------- reads ----------

export interface PersonView {
  readonly person_id: string;
  readonly name: string;
  readonly team_label?: string;
  readonly role: Role;
  readonly active: boolean;
  readonly linked: boolean;
  readonly slack_mapped: boolean;
  readonly in_latest_import: boolean;
  /** D-A10-2: open requests this person is the assignee of (GMs; 0 for everyone else). */
  readonly open_assigned: number;
}

/** D-A10-2: how many open requests `personId` is the assignee of (a count, no request read). */
async function openAssignedCount(api: Pick<ApiDeps, 'db'>, personId: string): Promise<number> {
  const query = api.db.collection('requests').where('assignee_id', '==', personId).where('status', 'in', [...OPEN_ASSIGNED_STATUSES]);
  return (await query.count().get()).data().count;
}

async function allPeople(api: Pick<ApiDeps, 'db'>): Promise<{ readonly id: string; readonly data: StoredData }[]> {
  const snapshot = await api.db.collection('people').limit(MAX_PEOPLE).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: fromStored(doc.data()) }));
}

/** The list of §13.3: search by name or e-mail, a page at a time; never the Slack ID itself. */
export async function readPeople(api: Pick<ApiDeps, 'db'>, query: string, offset: number) {
  const [people, latest] = await Promise.all([allPeople(api), api.db.doc(PEOPLE_IMPORT_PATH).get()]);
  const latestId = latest.exists ? latest.data()?.latest_import_id : undefined;
  const needle = query.trim().toLowerCase();
  const rows: PersonView[] = people
    .map(({ id, data }) => {
      const team = text(data.team_label);
      return {
        person_id: id,
        name: String(data.name ?? ''),
        ...(team === undefined ? {} : { team_label: team }),
        role: roleOf(data.role),
        active: data.active === true,
        linked: text(data.uid) !== undefined,
        slack_mapped: text(data.slack_user_id) !== undefined,
        in_latest_import: typeof latestId === 'string' && data.last_import_id === latestId,
        open_assigned: 0,
      };
    })
    .filter((person) => needle === '' || person.person_id.includes(needle) || person.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'th') || a.person_id.localeCompare(b.person_id));
  const start = Math.max(0, Math.floor(offset));
  // Counted for the GMs of this page only (a handful of count queries).
  const page = await Promise.all(rows.slice(start, start + PEOPLE_PAGE).map(async (person) => (isGmRole(person.role) ? { ...person, open_assigned: await openAssignedCount(api, person.person_id) } : person)));
  return {
    people: page,
    total: rows.length,
    ...(start + PEOPLE_PAGE < rows.length ? { next_offset: start + PEOPLE_PAGE } : {}),
    ...(latest.exists ? { latest_import: { at: fromStored(latest.data() ?? {}).imported_at, counts: latest.data()?.counts ?? {} } } : {}),
  };
}

export async function readUnlisted(api: Pick<ApiDeps, 'db'>) {
  const snapshot = await api.db.collection('unlisted_logins').limit(MAX_UNLISTED).get();
  const items = snapshot.docs
    .map((doc) => fromStored(doc.data()))
    .map((data) => ({ email: String(data.email ?? ''), first_seen_at: data.first_seen_at as number, last_seen_at: data.last_seen_at as number, count: typeof data.count === 'number' ? data.count : 1 }))
    .sort((a, b) => b.last_seen_at - a.last_seen_at);
  return { items };
}

// ---------- preview / import ----------

type Change = 'name' | 'team' | 'slack';

interface Planned {
  readonly person: CheckedPerson;
  readonly stored: StoredData | undefined;
  readonly changes: readonly Change[];
}

/** What a checked row changes on the stored person; a column not chosen changes nothing. */
function changesOf(person: CheckedPerson, stored: StoredData, teamColumn: boolean, slackColumn: boolean): Change[] {
  const changes: Change[] = [];
  if (String(stored.name ?? '') !== person.name) changes.push('name');
  if (teamColumn && text(stored.team_label) !== person.team_label) changes.push('team');
  if (slackColumn && text(stored.slack_user_id) !== person.slack_user_id) changes.push('slack');
  return changes;
}

async function plan(api: Pick<ApiDeps, 'db'>, body: PeopleImportBody) {
  const checked = checkPeopleRows(body.rows);
  // The team column was chosen when the rows carry it (the page sends it on every row, blank or not).
  const teamColumn = body.rows.some((row) => row.team !== undefined);
  const people = await allPeople(api);
  const stored = new Map(people.map((person) => [person.id, person.data]));
  const planned: Planned[] = checked.valid.map((person) => {
    const existing = stored.get(person.person_id);
    return { person, stored: existing, changes: existing === undefined ? [] : changesOf(person, existing, teamColumn, body.slack_column) };
  });
  const inFile = new Set(checked.valid.map((person) => person.person_id));
  return { checked, planned, teamColumn, notInFile: people.filter((person) => !inFile.has(person.id)).length };
}

export async function previewPeople(api: Pick<ApiDeps, 'db'>, body: PeopleImportBody) {
  const { checked, planned, notInFile } = await plan(api, body);
  const byLine = new Map<number, Record<string, unknown>>();
  for (const problem of checked.errors) byLine.set(problem.line, { line: problem.line, email: problem.email, status: 'error', codes: problem.codes });
  for (const entry of planned) {
    const status = entry.stored === undefined ? 'new' : entry.changes.length === 0 ? 'same' : 'update';
    byLine.set(entry.person.line, { line: entry.person.line, email: entry.person.person_id, status, ...(status === 'update' ? { changes: entry.changes } : {}) });
  }
  const rows = [...byLine.values()].sort((a, b) => (a.line as number) - (b.line as number));
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return { rows, counts: { new: count('new'), update: count('update'), same: count('same'), error: count('error') }, not_in_file: notInFile };
}

export interface ImportContext {
  readonly actorId: string;
  readonly now: Instant;
}

/** Saves the checked rows of one file; replayed by its import ID (the rows are never stored). */
export async function importPeople(api: Pick<ApiDeps, 'db'>, store: CommandStore, importId: string, body: PeopleImportBody, context: ImportContext) {
  const { actorId, now } = context;
  const fingerprint = commandFingerprint(actorId, { type: 'import_people', payload: { rows: body.rows, slack_column: body.slack_column } });
  const commandPath = `${COMMANDS_COLLECTION}/${importId}`;
  const earlier = await store.runTransaction(async (transaction) => transaction.get(commandPath));
  if (earlier !== undefined) {
    if (earlier.fingerprint !== fingerprint) throw new CommandRejected('COMMAND_ID_CONFLICT', 'This import ID was already used for another file');
    return { replayed: true, result: earlier.result };
  }
  const { checked, notInFile, teamColumn } = await plan(api, body);
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const renamed: string[] = [];
  for (let start = 0; start < checked.valid.length; start += IMPORT_CHUNK) {
    const chunk = checked.valid.slice(start, start + IMPORT_CHUNK);
    const outcome = await store.runTransaction(async (transaction) => {
      const counts = { created: 0, updated: 0, unchanged: 0, renamed: [] as string[] };
      const reads: { person: CheckedPerson; stored: StoredData | undefined; unlisted: StoredData | undefined }[] = [];
      for (const person of chunk) {
        const stored = await transaction.get(personPath(person.person_id));
        reads.push({ person, stored, unlisted: stored === undefined ? await transaction.get(unlistedPath(person.person_id)) : undefined });
      }
      for (const { person, stored, unlisted } of reads) {
        const team = person.team_label === undefined ? {} : { team_label: person.team_label };
        const slack = person.slack_user_id === undefined ? {} : { slack_user_id: person.slack_user_id };
        if (stored === undefined) {
          const uid = text(unlisted?.uid);
          const fresh = { email: person.person_id, name: person.name, ...team, ...slack, role: 'requester', active: true, last_import_id: importId, created_at: now, updated_at: now, ...(uid === undefined ? {} : { uid, linked_at: now }) };
          transaction.set(personPath(person.person_id), fresh);
          writePicker(transaction, person.person_id, fresh);
          // Signed in before being on the list (D-A09-1): their access is made now.
          if (uid !== undefined) {
            transaction.set(`access/${uid}`, accessFor({ personId: person.person_id, role: 'requester', active: true }));
            transaction.delete(unlistedPath(person.person_id));
          }
          counts.created += 1;
          continue;
        }
        const changes = changesOf(person, stored, teamColumn, body.slack_column);
        const { team_label: _team, slack_user_id: _slack, ...rest } = stored;
        const next = {
          ...rest,
          ...(teamColumn ? team : stored.team_label === undefined ? {} : { team_label: stored.team_label }),
          ...(body.slack_column ? slack : stored.slack_user_id === undefined ? {} : { slack_user_id: stored.slack_user_id }),
          email: person.person_id,
          name: person.name,
          last_import_id: importId,
          ...(changes.length === 0 ? {} : { updated_at: now }),
        };
        transaction.set(personPath(person.person_id), next);
        if (changes.includes('name') || changes.includes('team')) {
          writePicker(transaction, person.person_id, next);
          counts.renamed.push(person.person_id);
        }
        if (changes.length === 0) counts.unchanged += 1;
        else counts.updated += 1;
      }
      return counts;
    });
    created += outcome.created;
    updated += outcome.updated;
    unchanged += outcome.unchanged;
    renamed.push(...outcome.renamed);
  }
  const result = { created, updated, unchanged, skipped: checked.errors.length, not_in_file: notInFile };
  return store.runTransaction(async (transaction) => {
    const again = await transaction.get(commandPath);
    if (again !== undefined) return { replayed: true, result: again.result };
    transaction.set(PEOPLE_IMPORT_PATH, { latest_import_id: importId, imported_at: now, counts: result });
    // FU-11: the names of open requests follow, through the worker (bounded, survives a restart).
    if (renamed.length > 0) {
      transaction.set(`scheduled_work/display_refresh-${importId}`, { kind: 'display_refresh', state: 'scheduled', next_run_at: now, attempts: 0, created_at: now, person_ids: [...new Set(renamed)].sort() });
    }
    transaction.set(commandPath, { type: 'admin.import_people', actor_id: actorId, fingerprint, result, created_at: now, [COMMAND_EXPIRY_FIELD]: now + COMMAND_RETENTION_MS });
    return { replayed: false, result };
  });
}

// ---------- role, account, add (Admin commands, one transaction each) ----------

async function activeGmAdmins(transaction: CommandTransaction): Promise<string[]> {
  if (transaction.list === undefined) throw new Error('this store cannot list people');
  const rows = await transaction.list('people', 'role', 'gm_admin', MAX_ADMINS);
  return rows.filter((row) => row.data.active === true).map((row) => row.id);
}

/** Writes the person and, when they have signed in, their access in the same transaction. */
function writePerson(transaction: CommandTransaction, personId: string, next: StoredData): void {
  transaction.set(personPath(personId), next);
  writePicker(transaction, personId, next);
  const uid = text(next.uid);
  if (uid !== undefined) transaction.set(`access/${uid}`, accessFor({ personId, role: roleOf(next.role), active: next.active === true }));
}

export async function setPersonRole(transaction: CommandTransaction, personId: string, role: Role, now: Instant) {
  const stored = await transaction.get(personPath(personId));
  const admins = await activeGmAdmins(transaction);
  const planned = planPersonRole(personFacts(personId, stored), role, admins);
  writePerson(transaction, personId, { ...(stored as StoredData), role: planned.role, updated_at: now });
  return { person_id: personId, role: planned.role };
}

/** D-A10-2: the open requests `personId` is the assignee of, read in the transaction. */
async function openAssignedIds(transaction: CommandTransaction, personId: string): Promise<string[]> {
  if (transaction.list === undefined) throw new Error('this store cannot list requests');
  const rows = await transaction.list('requests', 'assignee_id', personId, MAX_RELEASED_REQUESTS);
  return rows.filter((row) => (OPEN_ASSIGNED_STATUSES as readonly unknown[]).includes(row.data.status)).map((row) => row.id).sort();
}

/**
 * Account on/off. D-A10-2: switching off a GM who is the assignee of open requests needs the Admin to
 * send that count (the latest, read here); a `release_assignments` job is written in the same
 * transaction, so the release finishes even if the caller stops (the API runs it at once, the worker's
 * tick picks up what is left).
 */
export async function setPersonActive(
  transaction: CommandTransaction,
  input: { readonly personId: string; readonly active: boolean; readonly confirmedOpenAssigned?: number | undefined; readonly jobId: string },
  now: Instant,
) {
  const { personId, active } = input;
  const stored = await transaction.get(personPath(personId));
  const admins = await activeGmAdmins(transaction);
  const person = personFacts(personId, stored);
  const open = !active && person !== undefined && isGmRole(person.role) ? await openAssignedIds(transaction, personId) : [];
  let planned;
  try {
    planned = planPersonActive(person, active, admins, { openAssigned: open.length, confirmedOpenAssigned: input.confirmedOpenAssigned });
  } catch (error) {
    if (error instanceof LifecycleRejected && error.code === 'OPEN_REQUESTS_ASSIGNED') {
      throw new CommandRejected('OPEN_REQUESTS_ASSIGNED', 'Confirm how many open requests are released', { open_assigned: open.length });
    }
    throw error;
  }
  writePerson(transaction, personId, { ...(stored as StoredData), active: planned.active, updated_at: now });
  if (!planned.releaseOpenRequests) return { person_id: personId, active: planned.active, released: 0 };
  transaction.set(`scheduled_work/${input.jobId}`, { kind: RELEASE_JOB_KIND, state: 'scheduled', next_run_at: now, attempts: 0, created_at: now, person_id: personId, request_ids: open });
  return { person_id: personId, active: planned.active, released: open.length, release_job: input.jobId };
}

/**
 * D-A10-2: runs a `release_assignments` job now — one transaction per request, each rechecking the
 * latest request — then marks it done. Safe to repeat, and safe next to the worker running the same job.
 */
export async function runReleaseJob(store: CommandStore, jobId: string, context: { readonly now: Instant; readonly directories: LifecycleDirectories }): Promise<number> {
  const path = `scheduled_work/${jobId}`;
  const job = await store.runTransaction(async (transaction) => transaction.get(path));
  if (job === undefined || job.state !== 'scheduled' || typeof job.person_id !== 'string') return 0;
  const personId = job.person_id;
  let released = 0;
  for (const requestId of Array.isArray(job.request_ids) ? job.request_ids.filter((id): id is string => typeof id === 'string') : []) {
    if (await store.runTransaction((transaction) => releaseAssignmentOf(transaction, { requestId, personId, now: context.now }, context.directories))) released += 1;
  }
  await store.runTransaction(async (transaction) => {
    const latest = await transaction.get(path);
    if (latest?.state === 'scheduled') transaction.set(path, { ...latest, state: 'done', completed_at: context.now });
  });
  return released;
}

/** D-A10-6: name and team edited by hand (blank team = cleared); open requests follow (FU-11). */
export async function updatePerson(transaction: CommandTransaction, input: { readonly personId: string; readonly name: string; readonly team?: string | undefined; readonly jobId: string }, now: Instant) {
  const name = input.name.replace(/\s+/g, ' ').trim();
  const team = (input.team ?? '').replace(/\s+/g, ' ').trim();
  if (name === '' || [...name].length > MAX_PERSON_NAME_CHARS || [...team].length > MAX_TEAM_LABEL_CHARS) throw new CommandRejected('LABEL_INVALID', 'Name 1–100 and team up to 60 characters');
  const stored = await transaction.get(personPath(input.personId));
  if (stored === undefined) throw new CommandRejected('PERSON_NOT_FOUND', 'No such person');
  const { team_label: previousTeam, ...rest } = stored;
  const changed = stored.name !== name || (text(previousTeam) ?? '') !== team;
  writePerson(transaction, input.personId, { ...rest, name, ...(team === '' ? {} : { team_label: team }), updated_at: now });
  if (changed) transaction.set(`scheduled_work/${input.jobId}`, { kind: 'display_refresh', state: 'scheduled', next_run_at: now, attempts: 0, created_at: now, person_ids: [input.personId] });
  return { person_id: input.personId, changed };
}

/** “เพิ่มเข้ารายชื่อ” from the logins not on the list (or by hand): an ordinary user, access at once. */
export async function addPerson(transaction: CommandTransaction, input: { readonly email: string; readonly name: string; readonly team?: string | undefined }, now: Instant) {
  const name = input.name.replace(/\s+/g, ' ').trim();
  const team = (input.team ?? '').replace(/\s+/g, ' ').trim();
  if (name === '' || [...name].length > MAX_PERSON_NAME_CHARS || [...team].length > MAX_TEAM_LABEL_CHARS) throw new CommandRejected('LABEL_INVALID', 'Name 1–100 and team up to 60 characters');
  const stored = await transaction.get(personPath(input.email));
  if (stored !== undefined) throw new CommandRejected('PERSON_EXISTS', 'This person is already on the list');
  const unlisted = await transaction.get(unlistedPath(input.email));
  const uid = text(unlisted?.uid);
  writePerson(transaction, input.email, {
    email: input.email,
    name,
    ...(team === '' ? {} : { team_label: team }),
    role: 'requester',
    active: true,
    created_at: now,
    updated_at: now,
    ...(uid === undefined ? {} : { uid, linked_at: now }),
  });
  if (unlisted !== undefined) transaction.delete(unlistedPath(input.email));
  return { person_id: input.email, linked: uid !== undefined };
}

// ---------- first login (D-A09-1, FU-38) ----------

/** Links a verified company sign-in to the person with that e-mail; records it when not on the list. */
export async function linkAccount(store: CommandStore, signIn: { readonly uid: string; readonly email: string }, now: Instant) {
  const email = signIn.email.trim().toLowerCase();
  return store.runTransaction(async (transaction) => {
    if ((await transaction.get(`access/${signIn.uid}`)) !== undefined) return { result: 'already' as const };
    const stored = await transaction.get(personPath(email));
    const person = personFacts(email, stored);
    const decision = linkDecision(person);
    if (decision === 'disabled') return { result: 'disabled' as const };
    if (decision === 'not_listed' || person === undefined || stored === undefined) {
      const seen = await transaction.get(unlistedPath(email));
      transaction.set(unlistedPath(email), {
        email,
        uid: signIn.uid,
        first_seen_at: typeof seen?.first_seen_at === 'number' ? seen.first_seen_at : now,
        last_seen_at: now,
        count: (typeof seen?.count === 'number' ? seen.count : 0) + 1,
      });
      return { result: 'not_listed' as const };
    }
    // A new Google account for the same e-mail takes over; the old account's access is switched off.
    const previousUid = text(stored.uid);
    const previous = previousUid !== undefined && previousUid !== signIn.uid ? await transaction.get(`access/${previousUid}`) : undefined;
    transaction.set(`access/${signIn.uid}`, accessFor(person));
    transaction.set(personPath(email), { ...stored, uid: signIn.uid, linked_at: now });
    if (previousUid !== undefined && previous !== undefined) transaction.set(`access/${previousUid}`, { ...previous, enabled: false });
    return { result: 'linked' as const };
  });
}
