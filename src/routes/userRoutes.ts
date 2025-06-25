import express, {Request, Response} from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import {admin, protect} from "../middleware/authMiddleware";

const router = express.Router();

// Create User (Admin Only)
router.post('/', protect, admin, async (req: Request, res: Response): Promise<void> => {
    const {name, password} = req.body;

    try {
        const existingUser = await User.findOne({name});
        if (existingUser) {
            res.status(400).json({message: 'User already exists'});
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            password: hashedPassword,
        });

        await newUser.save();

        res.status(201).json({message: 'User created successfully'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

// Get All Users (Admin Only)
router.get('/', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

// Get current user
router.get('/me', protect, async (req: any, res: Response): Promise<void> => {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
        res.status(404).json({message: 'User not found'});
        return;
    }
    res.json(user);
});

// Get User by ID
router.get('/:id', protect, async (req: Request, res: Response): Promise<void> => {
    const {id} = req.params;

    try {
        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({message: 'User not found'});
            return;
        }

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

// Update User (Admin Only)
router.put('/:id', protect, async (req: Request, res: Response): Promise<void> => {
    const {id} = req.params;
    const {name, password} = req.body;

    try {
        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({message: 'User not found'});
            return;
        }

        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        user.name = name;
        await user.save();

        res.json({message: 'User updated successfully'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

// Delete User (Admin Only)
router.delete('/:id', protect, admin, async (req: Request, res: Response): Promise<void> => {
    const {id} = req.params;

    try {
        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({message: 'User not found'});
            return;
        }

        await User.deleteOne({_id: id});

        res.json({message: 'User deleted successfully'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Server error'});
    }
});

export default router;
