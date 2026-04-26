// ==============================================================
//  Edifica API - entry point
// ==============================================================
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { healthCheck } from './src/db/pool.js';
import { notFoundHandler, errorHandler } from './src/middleware/errors.js';

import authRoutes from './src/routes/auth.js';
import usersRoutes from './src/routes/users.js';
import squadsRoutes from './src/routes/squads.js';
import gdvsRoutes from './src/routes/gdvs.js';
import clientsRoutes from './src/routes/clients.js';
import metricsRoutes from './src/routes/metrics.js';
import analysesRoutes from './src/routes/analyses.js';
import templateRoutes from './src/routes/template.js';
import accessRequestsRoutes from './src/routes/accessRequests.js';
import auditLogsRoutes from './src/routes/auditLogs.js';
import notificationsRoutes from './src/routes/notifications.js';
import projectsRoutes from './src/routes/projects.js';

const app = express();

// --------------------------------------------------------------
//  Middlewares básicos
// --------------------------------------------------------------
app.set('trust proxy', 1);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: (origin, cb) => {
      // Permite chamadas sem origin (curl, health checks) e a origem do frontend.
      if (!origin) return cb(null, true);
      if (origin === FRONTEND_URL) return cb(null, true);
      return cb(new Error(`CORS bloqueou origem ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));

// --------------------------------------------------------------
//  Health check
// --------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  const dbOk = await healthCheck().catch(() => false);
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------------------
//  Rotas da API
// --------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/squads', squadsRoutes);
app.use('/api/gdvs', gdvsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/metrics', metricsRoutes);

// analyses usa /api/clients como prefixo, mas com router próprio.
app.use('/api/clients', analysesRoutes);

app.use('/api/template', templateRoutes);
app.use('/api/access-requests', accessRequestsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/projects', projectsRoutes);

// --------------------------------------------------------------
//  404 + error handler
// --------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// --------------------------------------------------------------
//  Boot
// --------------------------------------------------------------
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`→ Edifica API rodando em http://localhost:${PORT}`);
  console.log(`  Frontend permitido: ${FRONTEND_URL}`);
});
