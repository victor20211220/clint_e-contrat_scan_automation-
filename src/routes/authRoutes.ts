import express, {Request, Response} from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import {generateToken} from '../utils/auth';

const router = express.Router();

// User Login
router.post('/login', async (req: Request, res: Response): Promise<void> =>{
    const {name, password} = req.body;

    try {
        const user = await User.findOne({name});
        if (!user) {
            res.status(400).json({message: 'User not found'});
            return;
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(400).json({message: 'Invalid credentials'});
        }

        // Generate JWT token
        const token = generateToken(user._id.toString(), user.is_admin);

        res.json({token});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

export default router;
