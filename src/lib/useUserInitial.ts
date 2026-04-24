import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * Returns the uppercase first character of the signed-in user's email, or
 * `undefined` during the initial session fetch. Subscribes to auth changes
 * so it updates on sign-in / sign-out without a remount.
 */
export const useUserInitial = (): string | undefined => {
  const [initial, setInitial] = useState<string | undefined>();
  useEffect(() => {
    const toInitial = (email: string | undefined): string | undefined => {
      const first = email?.[0];
      return first ? first.toUpperCase() : undefined;
    };
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setInitial(toInitial(data.session?.user.email));
      })
      .catch(() => {
        // Avatar is cosmetic; a blank circle is fine. AuthGate surfaces the
        // real error. onAuthStateChange will still fire once the session
        // arrives via a later network recovery.
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setInitial(toInitial(session?.user.email));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  return initial;
};
