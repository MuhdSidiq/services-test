import { Request, Response, NextFunction } from 'express';
import { Prisma } from '../../app/generated/prisma';

/**
 * Centralized error handling middleware
 * Translates Prisma errors and other exceptions into user-friendly responses
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', error);

  // Prisma Known Request Error (P2xxx errors)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const target = (error.meta?.target as string[]) || [];
        return res.status(409).json({
          success: false,
          error: 'Unique constraint violation',
          field: target[0] || 'unknown',
          message: `A record with this ${target[0] || 'value'} already exists`
        });

      case 'P2025':
        // Record not found
        return res.status(404).json({
          success: false,
          error: 'Record not found',
          message: 'The requested resource does not exist'
        });

      case 'P2003':
        // Foreign key constraint violation
        return res.status(400).json({
          success: false,
          error: 'Foreign key constraint violation',
          message: 'Referenced record does not exist'
        });

      case 'P2014':
        // Relation violation
        return res.status(400).json({
          success: false,
          error: 'Relation violation',
          message: 'The change violates a required relation'
        });

      default:
        return res.status(400).json({
          success: false,
          error: 'Database error',
          code: error.code,
          message: error.message
        });
    }
  }

  // Prisma Validation Error
  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      message: 'Invalid data provided'
    });
  }

  // Default error response
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
