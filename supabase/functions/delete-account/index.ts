import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const secret = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
Deno.serve(async request => {
  const auth = request.headers.get('Authorization') || ''
  const client = createClient(url, Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const admin = createClient(url, secret, { auth: { persistSession: false } })
  const { error } = await admin.auth.admin.deleteUser(user.id)
  return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ deleted: true })
})
