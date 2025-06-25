import {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: any;
}

// Middleware to protect routes
export const protect = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        res.status(401).json({message: 'No token, authorization denied'});
        return;
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET!);
        next(); // Proceed to the next middleware or route handler
    } catch (err) {
        res.status(401).json({message: 'Token is not valid'});
    }
};

// Admin Check Middleware
export const admin = (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.is_admin) {
        res.status(403).json({message: 'Access denied'});
        return;
    }
    next(); // Proceed if the user is admin
};
