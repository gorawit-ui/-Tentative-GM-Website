// A09 — logout on a device that others may use at the site: sign out of Firebase (the user record in
// IndexedDB goes), stop Firestore (memory cache only, gone with the page), empty this origin's
// localStorage, sessionStorage and Cache Storage (drafts or cached responses of later phases), then load
// the login page afresh so nothing of the previous person stays in memory either.
import { signOut, type Auth } from 'firebase/auth';
import { terminate, type Firestore } from 'firebase/firestore';

async function quietly(step: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await step();
  } catch {
    // Keep clearing the rest; the page reload below drops what is left in memory.
  }
}

export async function clearDeviceAndLeave(auth: Auth, db: Firestore): Promise<void> {
  await quietly(() => signOut(auth));
  await quietly(() => terminate(db));
  await quietly(() => localStorage.clear());
  await quietly(() => sessionStorage.clear());
  await quietly(async () => {
    if (!('caches' in window)) return;
    for (const key of await caches.keys()) await caches.delete(key);
  });
  window.location.replace('/login');
}
