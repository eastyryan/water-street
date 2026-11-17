import { db } from '@/lib/db';
import { DEMO_MANAGER_PIN, DEMO_STAFF_PIN, clearDemo, loadDemo } from '@/lib/demo';
import { bad, route } from '@/lib/http';

/**
 * POST    load made-up staff, schedule, time cards and sales. Only works while
 *         the app has no staff at all, so it can never overwrite real records.
 * DELETE  (manager) remove all demo data and go back to first-time setup.
 */
export const POST = route('public', async () => {
  const [{ n }] = await db()`select count(*)::int as n from staff`;
  if (n > 0) throw bad('Demo data can only be loaded before any staff are added.', 409);
  await loadDemo();
  return { ok: true, managerPin: DEMO_MANAGER_PIN, staffPin: DEMO_STAFF_PIN };
});

export const DELETE = route('manager', async () => {
  try {
    await clearDemo();
  } catch (e) {
    if ((e as Error).message === 'not-demo') throw bad('This is not demo data, so nothing was removed.', 409);
    throw e;
  }
  return { ok: true };
});
