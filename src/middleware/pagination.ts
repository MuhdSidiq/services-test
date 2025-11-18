import { Request, Response, NextFunction } from 'express';

/**
 * Pagination parameters interface
 */
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Pagination middleware - extracts and validates page/limit query params
 * Adds pagination object to request for use in controllers
 */
export const pagination = (req: Request, res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
  const skip = (page - 1) * limit;

  // Attach pagination params to request
  (req as any).pagination = { page, limit, skip };

  next();
};

/**
 * Helper to format paginated response
 */
export const paginatedResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) => {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};
