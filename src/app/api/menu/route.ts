import { db } from '@/lib/db';
import { getSettings } from '@/lib/data';
import { route } from '@/lib/http';

/** The whole menu in one response: categories, items, modifier groups, tax rate. */
export const GET = route('staff', async ({ session, url }) => {
  const sql = db();
  // Managers editing the menu also see removed items so they can bring them back.
  const all = url.searchParams.get('all') === '1' && session.role === 'manager';
  const [categories, items, groups, mods, settings] = await Promise.all([
    sql`select id, name from menu_categories order by sort, id`,
    sql`select id, category_id as "categoryId", name, description, cash_cents as cash, card_cents as card,
               modifier_groups as groups, is_available as available, is_active as active
        from menu_items ${all ? sql`` : sql`where is_active`} order by sort, id`,
    sql`select key, name, min_select as min, max_select as max from modifier_groups`,
    sql`select id, group_key as "groupKey", name, cash_cents as cash, card_cents as card from modifiers order by sort, id`,
    getSettings(),
  ]);
  return {
    categories,
    items,
    groups: groups.map((g) => ({ ...g, options: mods.filter((m) => m.groupKey === g.key) })),
    settings,
  };
});
