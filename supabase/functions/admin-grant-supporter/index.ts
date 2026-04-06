// ============================================================
// Gearnomic — Admin API Edge Function (Deno runtime)
// Deploy with: supabase functions deploy admin-grant-supporter --no-verify-jwt
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SECRET              = Deno.env.get('ADMIN_SECRET')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST')   return json({ error: 'POST only' }, 405);

  // Auth: accept "Bearer SECRET" or just "SECRET"
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!ADMIN_SECRET || bearer !== ADMIN_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const { action, email } = body;

  // ── List all users ─────────────────────────────────────
  if (action === 'list_users') {
    const { data: authData, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (error) return json({ error: error.message }, 500);

    const { data: userData } = await sb.from('user_data')
      .select('user_id, is_supporter, supporter_since, stripe_customer_id');

    const supporterMap: Record<string, any> = {};
    (userData || []).forEach((row: any) => { supporterMap[row.user_id] = row; });

    const result = (authData?.users || []).map((u: any) => {
      const ud = supporterMap[u.id] || {};
      return {
        id:              u.id,
        email:           u.email,
        created_at:      u.created_at,
        last_sign_in:    u.last_sign_in_at,
        confirmed:       !!u.confirmed_at,
        is_supporter:    !!ud.is_supporter,
        supporter_since: ud.supporter_since || null,
        has_stripe:      !!ud.stripe_customer_id,
      };
    });

    result.sort((a: any, b: any) => {
      if (a.is_supporter !== b.is_supporter) return a.is_supporter ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return json({ users: result });
  }

  // ── Email-based actions ────────────────────────────────
  if (!email) return json({ error: 'email is required' }, 400);

  const { data: authData, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return json({ error: listErr.message }, 500);

  const user = (authData?.users || []).find(
    (u: any) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (!user) return json({ error: `No account found for ${email}` }, 404);

  if (action === 'grant') {
    const { error } = await sb.from('user_data').upsert({
      user_id: user.id, is_supporter: true, supporter_since: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, message: `Supporter access granted to ${email}` });
  }

  if (action === 'revoke') {
    const { error } = await sb.from('user_data').upsert({
      user_id: user.id, is_supporter: false, supporter_since: null,
    }, { onConflict: 'user_id' });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, message: `Supporter access revoked for ${email}` });
  }

  if (action === 'delete_user') {
    const { error } = await sb.auth.admin.deleteUser(user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, message: `Account deleted: ${email}` });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
