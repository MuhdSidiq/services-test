import express from 'express';
import swaggerUi from 'swagger-ui-express';
import cors from 'cors';
import { swaggerSpec } from './config/swagger';

// Import middleware
import { errorHandler } from './middleware/error-handler';

// Import TypeScript routes
import rolesRoutes from './routes/roles.routes';
import usersRoutes from './routes/users.routes';
import sessionsRoutes from './routes/sessions.routes';
import centersRoutes from './routes/centers.routes';
import gantifiersRoutes from './routes/gantifiers.routes';
import jobOrdersRoutes from './routes/job-orders.routes';
import jobOffersRoutes from './routes/job-offers.routes';
import jobAssignmentsRoutes from './routes/job-assignments.routes';
import priorityScoresRoutes from './routes/priority-scores.routes';
import accountsRoutes from './routes/accounts.routes';
import paymentsRoutes from './routes/payments.routes';
import accountTransactionsRoutes from './routes/account-transactions.routes';
import withdrawalRequestsRoutes from './routes/withdrawal-requests.routes';
import webhooksRoutes from './routes/webhooks.routes';
import paymentActionsRoutes from './routes/payment-actions.routes';
import authRoutes from './routes/auth.routes';
import offersRoutes from './routes/offers.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import invoicesRoutes from './routes/invoices.routes';

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
  maxAge: 600,
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Gantify API Documentation',
  customfavIcon: '/favicon.ico'
}));

app.get('/api-docs.json', (_req: express.Request, res: express.Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Health check
app.get('/', (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'running',
    service: 'Gantify Services',
    message: 'Multi-service API for WhatsApp, Email, and PDF generation',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    documentation: {
      swagger: `${_req.protocol}://${_req.get('host')}/api-docs`,
      openapi: `${_req.protocol}://${_req.get('host')}/api-docs.json`,
      markdown: 'https://github.com/gantify/services/blob/main/API_DOCS.md'
    }
  });
});

app.use('/api/roles', rolesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/centers', centersRoutes);
app.use('/api/gantifiers', gantifiersRoutes);
app.use('/api/job-orders', jobOrdersRoutes);
app.use('/api/job-offers', jobOffersRoutes);
app.use('/api/job-assignments', jobAssignmentsRoutes);
app.use('/api/priority-scores', priorityScoresRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/account-transactions', accountTransactionsRoutes);
app.use('/api/withdrawal-requests', withdrawalRequestsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/payment-actions', paymentActionsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/invoices', invoicesRoutes);

// 404 handler
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    availableEndpoints: {
      core: {
        health: 'GET /',
        roles: 'GET/POST /api/roles',
        users: 'GET/POST /api/users',
        sessions: 'GET/POST /api/sessions',
        centers: 'GET/POST /api/centers',
        gantifiers: 'GET/POST /api/gantifiers',
        jobOrders: 'GET/POST /api/job-orders',
        jobOffers: 'GET/POST /api/job-offers',
        jobAssignments: 'GET/POST /api/job-assignments',
        priorityScores: 'GET/POST /api/priority-scores'
      },
      payment: {
        accounts: 'GET/POST /api/accounts',
        payments: 'GET/POST /api/payments',
        accountTransactions: 'GET/POST /api/account-transactions',
        withdrawalRequests: 'GET/POST /api/withdrawal-requests',
        paymentActions: 'POST /api/payment-actions/*',
        webhooks: 'POST /api/webhooks/billplz'
      },
      whatsapp: {
        notificationToCenter: 'POST /api/whatsapp/notification-to-center',
        jobOffer: 'POST /api/whatsapp/job-offer',
        sendOtp: 'POST /api/whatsapp/send-otp',
        deliveryUpdate: 'POST /api/whatsapp/delivery-update',
        health: 'GET /api/whatsapp/health'
      },
      auth: {
        login: 'POST /api/auth/login',
        verifyOtp: 'POST /api/auth/verify-otp',
        magicLink: 'POST /api/auth/magic-link',
        verifyMagicLink: 'GET/POST /api/auth/verify-magic-link',
        centerSignupRequestOtp: 'POST /api/auth/center/signup/request-otp',
        centerSignupComplete: 'POST /api/auth/center/signup/complete'
      },
      offers: {
        getOfferByToken: 'GET /api/offers/:token',
        acceptOffer: 'GET /api/offers/:token/accept',
        rejectOffer: 'GET /api/offers/:token/reject'
      },
      invoices: {
        downloadInvoice: 'GET /api/invoices/job-order/:job_order_id/download',
        previewInvoice: 'GET /api/invoices/job-order/:job_order_id/preview'
      }
    }
  });
});

// Global error handler
app.use(errorHandler);

export default app;

