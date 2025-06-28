// routes/index.ts
import express from 'express';
import authRoutes from "./authRoutes";
import userRoutes from "./userRoutes";
import nominationRoutes from "./nominationRoutes";
import settingRoutes from "./settingRoutes";


const router = express.Router();

// Routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/nominations', nominationRoutes);
router.use('/settings', settingRoutes);


export default router;