// Pages Function: GET /api/health
// Proves Functions routing works. It does not read user data.
// context.env.DB is true only once the D1 binding is configured.
export async function onRequest(context) {
  return Response.json({
    ok: true,
    project: "family-pilot",
    phase: 1,
    db_binding_present: Boolean(context.env.DB),
  });
}
