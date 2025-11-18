import { Request, Response, NextFunction } from 'express';

/**
 * Validation middleware factory
 * Validates that required fields exist in request body
 */
export const validateRequired = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing: string[] = [];

    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        fields: missing
      });
    }

    next();
  };
};

/**
 * Validate UUID format
 */
export const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/**
 * Middleware to validate ID parameter
 */
export const validateId = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  if (!id || !isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
      message: 'ID must be a valid UUID'
    });
  }

  next();
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Sanitize input by removing unwanted fields
 */
export const sanitizeInput = (data: any, allowedFields: string[]) => {
  const sanitized: any = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sanitized[field] = data[field];
    }
  }

  return sanitized;
};
