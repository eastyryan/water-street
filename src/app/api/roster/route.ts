import { db } from '@/lib/db';
import { route } from '@/lib/http';

/**
 * Names for the "who are you?" screen, plus who (if anyone) is signed in on
 * this device. Names are not secret - PINs are, and they never leave the server.
 */
export const GET = route('public', async ({ session }) => {
  const staff = await db()`select id, name, role, position from staff where is_active order by name`;
  return {
    staff,
    needsSetup: !staff.some((s) => s.role === 'manager'),
    session: session ? { id: session.id, name: session.name, role: session.role } : null,
  };
});
