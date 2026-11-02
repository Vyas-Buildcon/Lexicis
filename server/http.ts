import { NextFunction, Request, Response, Router } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

/** Forwards errors from async handlers to Express's error middleware (Express 4 does not). */
function catchAsync(handler: Handler): Handler {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result instanceof Promise) result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/** An express Router whose GET/POST handlers may be async without risking unhandled rejections. */
export function createRouter(): Router {
  const router = Router();
  for (const method of ['get', 'post'] as const) {
    const register = router[method].bind(router) as (path: string, ...handlers: Handler[]) => Router;
    (router as any)[method] = (path: string, ...handlers: Handler[]) => register(path, ...handlers.map(catchAsync));
  }
  return router;
}

/** Final error handler: logs the failure and answers with JSON, never a stack trace in production. */
export function errorHandler(isProduction: boolean) {
  return (err: any, req: Request, res: Response, _next: NextFunction) => {
    // Malformed or oversized JSON bodies from body-parser
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) {
      console.error(`[API ERROR] ${req.method} ${req.originalUrl}:`, err);
    }
    if (res.headersSent) return;
    res.status(status).json({
      error: status >= 500
        ? (isProduction ? 'An unexpected server error occurred.' : String(err?.message || err))
        : (err?.expose && err.message) || 'Invalid request.'
    });
  };
}
