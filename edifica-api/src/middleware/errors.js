// ==============================================================
//  Error handler central
// ==============================================================
import { HttpError } from '../utils/helpers.js';

export function notFoundHandler(req, res, next) {
  next(new HttpError(404, 'Rota não encontrada'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Logs completos no servidor, mas só devolve o essencial ao cliente.
  const status = err instanceof HttpError ? err.status : 500;
  const payload = {
    error: err.message || 'Erro interno',
  };
  if (err.details) payload.details = err.details;

  if (status >= 500) {
    console.error('[api]', err);
  }

  res.status(status).json(payload);
}
