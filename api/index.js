// Vercel Function for every /api route. The Express API is bundled by `npm run build`
// into build/vercel-handler.cjs (see server/vercel.ts). It is loaded on the first request
// so a startup failure is returned as a readable error instead of FUNCTION_INVOCATION_FAILED.
let loading;

function loadHandler() {
  loading ??= import('../build/vercel-handler.cjs').then(mod => {
    const bundled = mod.default || mod;
    return bundled.default || bundled;
  });
  return loading;
}

export default async function handler(req, res) {
  let app;
  try {
    app = await loadHandler();
  } catch (error) {
    loading = undefined;
    console.error('[Startup] API failed to load:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The API failed to start.', detail: String(error?.stack || error).slice(0, 2000) }));
    return;
  }
  return app(req, res);
}
