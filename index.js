require('dotenv').config();
const express = require('express');
const whatsappRoutes = require('./routes/whatsapp.routes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'Gantify Services',
        message: 'Multi-service API for WhatsApp, Email, and PDF generation',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Mount routes
app.use('/api/whatsapp', whatsappRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
        availableEndpoints: {
            whatsapp: {
                notificationToCenter: 'POST /api/whatsapp/notification-to-center',
                jobOffer: 'POST /api/whatsapp/job-offer',
                sendOtp: 'POST /api/whatsapp/send-otp',
                deliveryUpdate: 'POST /api/whatsapp/delivery-update',
                health: 'GET /api/whatsapp/health'
            }
        }
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

app.listen(port, () => {
    console.log(`🚀 Gantify Services running on port ${port}`);
    console.log(`📱 WhatsApp API: http://localhost:${port}/api/whatsapp`);
    console.log(`🏥 Health check: http://localhost:${port}/`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
})
