// Serves /api/* from the same handlers in `vite` dev and `vite preview`,
// so local development matches the Vercel deployment.
export function sanchariApi() {
  const mount = (server) => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      try {
        const { nodeHandler } = await import('./node.js');
        await nodeHandler(req, res);
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: { code: 'internal_error', message: 'API failed to start.' } }));
        console.error(e);
      }
    });
  };
  return { name: 'sanchari-api', configureServer: mount, configurePreviewServer: mount };
}
