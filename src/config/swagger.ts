import swaggerJsdoc from 'swagger-jsdoc';

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Gantify API',
      version: '1.0.0',
      description: 'Childcare staffing marketplace API - connecting centers with qualified gantifiers (childcare workers)',
      contact: {
        name: 'Gantify Support',
        email: 'support@gantify.my',
        url: 'https://gantify.my'
      },
      license: {
        name: 'Proprietary',
        url: 'https://gantify.my/terms'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.gantify.my',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'Authentication endpoints (OTP, Magic Link)'
      },
      {
        name: 'Job Orders',
        description: 'Job order management'
      },
      {
        name: 'Payments',
        description: 'Payment processing and management'
      },
      {
        name: 'Job Offers',
        description: 'Job offer management (token-based, no auth required)'
      },
      {
        name: 'WhatsApp',
        description: 'WhatsApp notifications'
      },
      {
        name: 'Centers',
        description: 'Childcare center management'
      },
      {
        name: 'Gantifiers',
        description: 'Gantifier (worker) management'
      },
      {
        name: 'Accounts',
        description: 'Account and balance management'
      },
      {
        name: 'Webhooks',
        description: 'Webhook endpoints (Billplz, etc.)'
      },
      {
        name: 'Users',
        description: 'User management'
      },
      {
        name: 'Sessions',
        description: 'Session management'
      },
      {
        name: 'Roles',
        description: 'Role management'
      }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Error description'
            },
            message: {
              type: 'string',
              example: 'Detailed error message'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'user_123'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john@example.com'
            },
            phone: {
              type: 'string',
              example: '60123456789'
            },
            phoneVerified: {
              type: 'boolean',
              example: true
            },
            roles: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  enum: ['CENTER', 'GANTIFIER', 'ADMIN'],
                  example: 'CENTER'
                }
              }
            }
          }
        },
        JobOrder: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'job_123'
            },
            center_id: {
              type: 'string',
              example: 'center_123'
            },
            gantifier_id: {
              type: 'string',
              nullable: true,
              example: 'gantifier_123'
            },
            scheduled_date: {
              type: 'string',
              format: 'date-time',
              example: '2025-12-01T09:00:00Z'
            },
            start_time: {
              type: 'string',
              example: '09:00'
            },
            end_time: {
              type: 'string',
              example: '17:00'
            },
            rate: {
              type: 'number',
              example: 150.00
            },
            total_cost: {
              type: 'number',
              example: 150.00
            },
            gantifier_fee: {
              type: 'number',
              example: 135.00
            },
            service_fee: {
              type: 'number',
              example: 15.00
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'AWAITING_GANTIFIER_RESPONSE', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
              example: 'PENDING'
            },
            job_tasks: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['Childcare assistance', 'Meal preparation']
            },
            center_location: {
              type: 'string',
              example: '3.139003,101.686855'
            }
          }
        },
        Payment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'payment_123'
            },
            job_order_id: {
              type: 'string',
              example: 'job_123'
            },
            center_id: {
              type: 'string',
              example: 'center_123'
            },
            total_amount: {
              type: 'number',
              example: 150.00
            },
            gantifier_fee: {
              type: 'number',
              example: 135.00
            },
            service_fee: {
              type: 'number',
              example: 15.00
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'PAID', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'],
              example: 'PENDING'
            },
            payment_method: {
              type: 'string',
              example: 'BILLPLZ'
            },
            billplz_bill_id: {
              type: 'string',
              example: 'bill_123'
            },
            billplz_url: {
              type: 'string',
              example: 'https://www.billplz.com/bills/bill_123'
            }
          }
        },
        JobOffer: {
          type: 'object',
          properties: {
            offerId: {
              type: 'string',
              example: 'offer_123'
            },
            token: {
              type: 'string',
              example: 'nD3larZZ'
            },
            status: {
              type: 'string',
              enum: ['SENT', 'DELIVERED', 'READ', 'ACCEPTED_BY_GANTIFIER', 'REJECTED_BY_GANTIFIER', 'SUPERSEDED', 'EXPIRED'],
              example: 'READ'
            },
            isValid: {
              type: 'boolean',
              example: true
            },
            gantifier: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  example: 'gantifier_123'
                },
                name: {
                  type: 'string',
                  example: 'Jane Worker'
                }
              }
            },
            jobOrder: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  example: 'job_123'
                },
                centerName: {
                  type: 'string',
                  example: 'ABC Learning Center'
                },
                scheduledDate: {
                  type: 'string',
                  format: 'date-time',
                  example: '2025-12-01T09:00:00Z'
                },
                rate: {
                  type: 'number',
                  example: 150.00
                }
              }
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-11-02T10:30:00Z'
            }
          }
        }
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authenticated requests. To get a token:\n1. Call POST /api/auth/verify-otp with phone and OTP\n2. Or call POST /api/auth/magic-link followed by POST /api/auth/verify-magic-link\n3. Copy the token from the response\n4. Click "Authorize" button and paste: Bearer <your-token>'
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service authentication'
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required - JWT token missing or invalid',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false
                  },
                  error: {
                    type: 'string',
                    example: 'No authorization header provided'
                  },
                  message: {
                    type: 'string',
                    example: 'Please provide a valid JWT token in Authorization header'
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/**/*.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
