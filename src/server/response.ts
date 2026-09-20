const rateBuckets = new Map<string, { count: number; reset: number }>();
const loginBuckets = new Map<string, { count: number; reset: number }>();
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
