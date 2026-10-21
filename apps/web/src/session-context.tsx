// A09 — the signed-in person, as the app knows them (UI-01, Part 6 §6.5). Firebase Auth says who is
// signed in; only a verified @tdfb.co Google sign-in goes on (anything else is signed out at once with a
// Thai message); then one listener on access/{uid} gives the role — so an account switched off while
// in use shows “บัญชีถูกปิด” straight away (D-S09-6: the person may read their own access document).
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@gm/domain';
import { clearDeviceAndLeave } from './device';
import { auth, db } from './firebase';
import { accessStateOf, isCompanySignIn } from './session';

export interface SignedInUser {
  readonly uid: string;
  readonly email: string;
  /** The Google profile name (their own), or the e-mail when there is none. */
  readonly name: string;
}

export type SessionState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'checking'; readonly user: SignedInUser }
  | { readonly kind: 'active'; readonly user: SignedInUser; readonly role: Role; readonly personId: string }
  | { readonly kind: 'disabled' | 'no_access' | 'error'; readonly user: SignedInUser };

/** UI-01 Error: cancelled, failed and not-a-company-account are told apart. */
export type LoginNotice = { readonly kind: 'outsider'; readonly email: string } | { readonly kind: 'cancelled' } | { readonly kind: 'failed' };

interface SessionValue {
  readonly state: SessionState;
  readonly notice: LoginNotice | undefined;
  signInWithGoogle(): Promise<void>;
  /** Logout / “เปลี่ยนบัญชี”: clears the device and opens the login page. */
  leave(): Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/user-cancelled']);

function signedInUser(user: User): SignedInUser {
  const email = user.email ?? '';
  return { uid: user.uid, email, name: user.displayName?.trim() || email };
}

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ kind: 'starting' });
  const [notice, setNotice] = useState<LoginNotice>();

  useEffect(() => {
    let run = 0;
    let stopAccess: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      run += 1;
      const current = run;
      stopAccess?.();
      stopAccess = undefined;
      if (user === null) {
        setState({ kind: 'signed_out' });
        return;
      }
      void (async () => {
        const who = signedInUser(user);
        let company: boolean;
        try {
          company = isCompanySignIn((await user.getIdTokenResult()).claims);
        } catch {
          if (current === run) setState({ kind: 'error', user: who });
          return;
        }
        if (current !== run) return;
        if (!company) {
          // D-S10-5: never kept signed in; the message stays on the login page.
          setNotice({ kind: 'outsider', email: who.email });
          await signOut(auth).catch(() => undefined);
          return;
        }
        setState({ kind: 'checking', user: who });
        stopAccess = onSnapshot(
          doc(db, 'access', user.uid),
          (snapshot) => {
            const access = accessStateOf(snapshot.exists() ? snapshot.data() : undefined);
            setState(access.kind === 'active' ? { kind: 'active', user: who, role: access.role, personId: access.personId } : { kind: access.kind, user: who });
          },
          () => setState({ kind: 'error', user: who }),
        );
      })();
    });
    return () => {
      stopAuth();
      stopAccess?.();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setNotice(undefined);
    const provider = new GoogleAuthProvider();
    // `hd` only preselects company accounts in Google's chooser; the check is isCompanySignIn.
    provider.setCustomParameters({ hd: 'tdfb.co', prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = (error as { readonly code?: unknown }).code;
      if (typeof code === 'string' && CANCELLED.has(code)) setNotice({ kind: 'cancelled' });
      else if (code === 'auth/popup-blocked') await signInWithRedirect(auth, provider).catch(() => setNotice({ kind: 'failed' }));
      else if (code !== 'auth/cancelled-popup-request') setNotice({ kind: 'failed' });
    }
  }, []);

  const leave = useCallback(() => clearDeviceAndLeave(auth, db), []);

  const value = useMemo(() => ({ state, notice, signInWithGoogle, leave }), [state, notice, signInWithGoogle, leave]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === undefined) throw new Error('useSession outside SessionProvider');
  return value;
}
