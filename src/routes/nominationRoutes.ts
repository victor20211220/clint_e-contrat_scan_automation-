import express, {Request, Response} from 'express';
import Nomination from '../models/Nomination';
import Setting from '../models/Setting';
import {AuthRequest, protect} from '../middleware/authMiddleware';
import dayjs from "dayjs";

const router = express.Router();

// Create Nomination
router.post('/', protect, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const nom = await Nomination.create(req.body);
        res.status(201).json(nom);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to create nomination'});
    }
});

// Get All Nominations (with optional filters)
router.get('/', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            user_id,
            page = 1,
            limit = 10,
            sort_by = 'contract_name',
            sort_order = 'asc',
            status,
        } = req.query;


        const today = dayjs();
        const startOfToday = today.startOf('day').toDate();
        const endOfToday = today.endOf('day').toDate();
        const startOfWeek = today.startOf('week').toDate();
        const startOfMonth = today.startOf('month').toDate();
        let filters: any = {};
        let nomination_date = null;
        switch (status) {
            case "all":
                break;
            case "sent_received":
                filters = {
                    $or: [{sent: true}, {received: true}],
                }
                break;
            case "this_month":
                nomination_date = {$gte: startOfMonth, $lte: endOfToday};
                break;

            case "this_week":
                nomination_date = {$gte: startOfWeek, $lte: endOfToday};
                break;

            case "on_today":
                nomination_date = {$gte: startOfToday, $lte: endOfToday};
                break;

            case "overdue":
                nomination_date = {$gt: endOfToday};
                break;
        }
        if (nomination_date) {
            filters = {
                nomination_date: nomination_date,
                sent: false,
                received: false,
            }
        }

        if (user_id) filters.user_id = user_id;

        const sort: any = {};
        sort[sort_by as string] = sort_order === 'desc' ? -1 : 1;

        const total = await Nomination.countDocuments(filters);

        const nominations = await Nomination.find(filters)
            .populate('user_id', 'name')
            .skip((+page - 1) * +limit)
            .limit(+limit)
            .sort(sort);

        res.json({
            total,
            page: +page,
            limit: +limit,
            nominations,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to fetch nominations'});
    }
});


// Nomination stats block
router.get('/stats/summary', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const today = dayjs();
        const startOfToday = today.startOf('day').toDate();
        const endOfToday = today.endOf('day').toDate();
        const startOfWeek = today.startOf('week').toDate();
        const startOfMonth = today.startOf('month').toDate();

        const all = await Nomination.countDocuments();
        const this_month = await Nomination.countDocuments({
            nomination_date: {$gte: startOfMonth, $lte: endOfToday},
            sent: false,
            received: false,
        });
        const this_week = await Nomination.countDocuments({
            nomination_date: {$gte: startOfWeek, $lte: endOfToday},
            sent: false,
            received: false,
        });

        const on_today = await Nomination.countDocuments({
            nomination_date: {$gte: startOfToday, $lte: endOfToday},
            sent: false,
            received: false,
        });

        const sent_received = await Nomination.countDocuments({
            $or: [{sent: true}, {received: true}],
        });

        const overdue = await Nomination.countDocuments({
            nomination_date: {$gt: endOfToday},
            sent: false,
            received: false,
        });

        res.json({all, this_month, this_week, on_today, sent_received, overdue});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to fetch stats'});
    }
});

// Bulk update nominations as sent or received
router.put('/bulk-update-status', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const {ids, action} = req.body; // action: "sent" or "received"

        if (!Array.isArray(ids) || !['sent', 'received'].includes(action)) {
            res.status(400).json({message: 'Invalid payload'});
            return;
        }

        const update: any = {};
        update[action] = true;
        if (action === "sent") update['received'] = false;
        if (action === "received") update['sent'] = false;

        await Nomination.updateMany({_id: {$in: ids}}, {$set: update});

        res.json({message: `Marked ${ids.length} nominations as ${action}`});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Bulk update failed'});
    }
});


// Get Nomination by ID
router.get('/:id', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const nom = await Nomination.findById(req.params.id).populate('user_id', 'name');
        if (!nom) {
            res.status(404).json({message: 'Not found'});
            return;
        }
        res.json(nom);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Server error'});
    }
});

// Generate "Send Nom" content
router.get('/:id/send-content', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const nomination = await Nomination.findById(req.params.id);
        const setting = await Setting.findOne({key: 'company_name'});

        if (!nomination || !setting) {
            res.status(404).json({message: 'Not found'});
            return;
        }

        const company = setting.value;
        const {buyer, seller, for_seller_or_buyer} = nomination;

        const isCompanySender =
            (company === buyer && for_seller_or_buyer === 'buyer') ||
            (company === seller && for_seller_or_buyer === 'seller');

        if (!isCompanySender) {
            res.status(400).json({message: "It's not the nomination for the company to send"});
            return;
        }

        const receiver = company === buyer ? seller : buyer;
        const content = `Dear ${receiver}\n\nWe hereby nominate the ${nomination.nomination_keyword} and reserve our rights to renominate as per agreed terms.\n\nPlease kindly confirm receipt.\nBest Regards, ${company}`;

        res.json({content});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to generate content'});
    }
});

// Generate "Send All Nom" content
router.get('/:id/send-all-content', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const nomination = await Nomination.findById(req.params.id);
        const setting = await Setting.findOne({key: 'company_name'});

        if (!nomination || !setting) {
            res.status(404).json({message: 'Not found'});
            return;
        }

        const company = setting.value;
        const receiver = company === nomination.buyer ? nomination.seller : nomination.buyer;

        const content = `Dear ${receiver}\n\nPlease note that we hereby nominate the following:\n• Cargo Quantity:  "EMPTY"\n• LNG Shop: "EMPTY"\n• Arrival Period: ${nomination.arrival_period.toDateString()}\n• Loading/Discharge Port "EMPTY"\n\nand reserve our rights to renominate as per agreed terms.\nBest Regards, ${company}`;

        res.json({content});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to generate content'});
    }
});


// Update Nomination
router.put('/:id', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const nom = await Nomination.findByIdAndUpdate(req.params.id, req.body, {new: true});
        res.json(nom);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to update nomination'});
    }
});

// Assign user to a nomination
router.put('/:id/assign', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const {user_id} = req.body;
        const nom = await Nomination.findByIdAndUpdate(req.params.id, {user_id}, {new: true});
        res.json(nom);
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to assign user'});
    }
});


// Delete Nomination
router.delete('/:id', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        await Nomination.findByIdAndDelete(req.params.id);
        res.json({message: 'Deleted'});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to delete'});
    }
});

export default router;