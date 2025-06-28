import express, {Request, Response} from 'express';
import Setting from '../models/Setting';
import {protect} from '../middleware/authMiddleware';

const router = express.Router();


router.get('/', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const settings = await Setting.find(); // fetch all documents

        if (!settings || settings.length === 0) {
            res.status(404).json({message: 'No settings found'});
            return;
        }

        res.json(settings);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to fetch settings'});
    }
});

export default router;
