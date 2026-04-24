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
    const toInitial = (email: string | undefined): string | undefined =>
      email && email.length > 0 ? email[0]!.toUpperCase() : undefined;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setInitial(toInitial(data.session?.user.email));
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
