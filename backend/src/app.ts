import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { allowedOrigins, env, isProd } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import configRoutes from './routes/config.routes.js';
import customerRoutes from './routes/customer.routes.js';
import geoRoutes from './routes/geo.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import riderRoutes from './routes/rider.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      return callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

if (!isProd) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(
        `[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
      );
    });
    next();
  });
}

app.get(['/health', '/api/health'], (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    ok: true,
    service: `${env.APP_NAME} ride API`,
    env: env.NODE_ENV,
    database: states[mongoose.connection.readyState] ?? 'unknown',
    uptimeSeconds: Math.round(process.uptime()),
    socket: 'socket.io',
    time: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.json({
    service: `${env.APP_NAME} ride-hailing API`,
    version: '1.0.0',
    docs: '/api/health',
  });
});

app.use('/api', globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', uploadRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
