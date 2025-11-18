import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// JWT Secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Extend Express Request type to include user
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone?: string;
    email?: string;
    role?: string;
  };
}

/**
 * Generate JWT token for authenticated user
 */
export function generateToken(payload: {
  userId: string;
  phone?: string;
  email?: string;
  role?: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verify JWT token and extract payload
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Authentication middleware - protect routes
 * Usage: router.get('/protected', authenticate, handler)
 */
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'No authorization header provided',
        message: 'Please provide a valid JWT token in Authorization header',
      });
      return;
    }

    // Check if it's Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Invalid authorization format',
        message: 'Authorization header must be in format: Bearer <token>',
      });
      return;
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        message: 'Please login again to get a new token',
      });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      phone: decoded.phone,
      email: decoded.email,
      role: decoded.role,
    };

    // Continue to next middleware/handler
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: 'An error occurred during authentication',
    });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 * Useful for endpoints that work differently for authenticated vs anonymous users
 */
export function optionalAuthenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (decoded) {
      req.user = {
        userId: decoded.userId,
        phone: decoded.phone,
        email: decoded.email,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    // Silently fail, continue without user
    next();
  }
}

/**
 * Role-based authorization middleware
 * Usage: router.get('/admin', authenticate, requireRole('ADMIN'), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Please login first',
      });
      return;
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `This endpoint requires one of the following roles: ${allowedRoles.join(', ')}`,
        userRole: req.user.role || 'none',
      });
      return;
    }

    next();
  };
}
