import express, {Request, Response} from 'express';
import Nomination from '../models/Nomination';
import Setting from '../models/Setting';
import {AuthRequest, protect} from '../middleware/authMiddleware';
import {scanNominationsFolder} from '../scan_nominations.js';
import dayjs from "dayjs";
import {getSettingValue} from "../utils/helpers";

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
        const endOfWeek = today.endOf('week').toDate();
        const startOfMonth = today.startOf('month').toDate();
        const endOfMonth = today.endOf('month').toDate();
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
                nomination_date = {$gte: startOfMonth, $lte: endOfMonth};
                break;

            case "this_week":
                nomination_date = {$gte: startOfWeek, $lte: endOfWeek};
                break;

            case "on_today":
                nomination_date = {$gte: startOfToday, $lte: endOfToday};
                break;

            case "overdue":
                nomination_date = {$lte: endOfToday};
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
        const endOfWeek = today.endOf('week').toDate();
        const startOfMonth = today.startOf('month').toDate();
        const endOfMonth = today.endOf('month').toDate();

        const all = await Nomination.countDocuments();
        const this_month = await Nomination.countDocuments({
            nomination_date: {$gte: startOfMonth, $lte: endOfMonth},
            sent: false,
            received: false,
        });
        const this_week = await Nomination.countDocuments({
            nomination_date: {$gte: startOfWeek, $lte: endOfWeek},
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
            nomination_date: {$lte: endOfToday},
            sent: false,
            received: false,
        });

        res.json({all, this_month, this_week, on_today, sent_received, overdue});
    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Failed to fetch stats'});
    }
});

router.put('/bulk-update-status', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const {ids, action} = req.body;

        if (!Array.isArray(ids) || !['sent', 'received', 'delete'].includes(action)) {
            res.status(400).json({message: 'Invalid payload'});
            return;
        }

        if (action === 'delete') {
            const result = await Nomination.deleteMany({_id: {$in: ids}});
            res.json({message: `Deleted ${result.deletedCount} nominations`});
            return;
        }

        const companyName = await getSettingValue('company_name');
        if (!companyName) {
            res.status(500).json({message: 'Company name not configured'});
            return;
        }

        const isSent = action === 'sent';

        const query = {
            _id: {$in: ids},
            $or: [
                {
                    for_seller_or_buyer: 'buyer',
                    buyer: isSent ? companyName : {$ne: companyName}
                },
                {
                    for_seller_or_buyer: 'seller',
                    seller: isSent ? companyName : {$ne: companyName}
                }
            ]
        };

        const update = isSent ? {sent: true} : {received: true};

        const result = await Nomination.updateMany(query, {$set: update});
        res.json({message: `Updated ${result.modifiedCount} nominations as ${action}`});

    } catch (err) {
        console.error(err);
        res.status(500).json({message: 'Bulk action failed'});
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

        const getKeywordValue = (type: string) => {
            return Nomination.findOne({
                contract_name: nomination.contract_name,
                nomination_type: type,
            }).then((match) => {
                if (match?.nomination_keyword) {
                    const parts = match.nomination_keyword.split('as');
                    return parts.length > 1 ? parts[1].trim() : 'Input Data';
                }
                return 'Input Data';
            });
        };

        const [cargoQuantity, lngShop, loadingPort, dischargePort] = await Promise.all([
            getKeywordValue('Cargo Quantity'),
            getKeywordValue('LNG Ship'),
            getKeywordValue('Loading Port'),
            getKeywordValue('Discharge Port'),
        ]);

        const content = `Dear ${receiver}\n\nPlease note that we hereby nominate the following:\n• Cargo Quantity: "${cargoQuantity}"\n• LNG Ship: "${lngShop}"\n• Arrival Period: ${nomination.arrival_period.toDateString()}\n• Loading Port: "${loadingPort}"\n• Discharge Port: "${dischargePort}"\n\nand reserve our rights to renominate as per agreed terms.\nBest Regards, ${company}`;

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

// Assign user to a nomination and all nominations with same contract_name
router.put('/:id/assign', protect, async (req: Request, res: Response): Promise<void> => {
    try {
        const {user_id} = req.body;

        // First, get the nomination to find its contract_name
        const nomination = await Nomination.findById(req.params.id);
        if (!nomination) {
            res.status(404).json({message: 'Nomination not found'});
            return;
        }

        // Update all nominations with the same contract_name
        const result = await Nomination.updateMany(
            {contract_name: nomination.contract_name},
            {user_id},
            {new: true}
        );

        // Get the updated nominations to return
        const updatedNominations = await Nomination.find({contract_name: nomination.contract_name});

        res.json({
            message: `Updated ${result.modifiedCount} nominations`,
            nominations: updatedNominations
        });
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


router.post('/scan', protect, async (req, res) => {
    try {
        const inserted = await scanNominationsFolder();
        res.json({message: `Scanned ${inserted.length} new nominations`, count: inserted.length});
    } catch (err) {
        console.error('Scan failed:', err);
        res.status(500).json({message: 'Scan failed'});
    }
});

export default router;
