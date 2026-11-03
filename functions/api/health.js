// Pages Function: GET /api/health
// Proves Functions routing works in Phase 0. It does not read user data.
// context.env.DB is true only once the D1 binding is configured in Wrangler / Pages.
export async function onRequest(context) {
  return Response.json({
    ok: true,
    project: "family-pilot",
    phase: 0,
    db_binding_present: Boolean(context.env.DB),
  });
}
