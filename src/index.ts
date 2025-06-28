import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db';
import router from "./routes";
import cors from 'cors';

dotenv.config();

const app = express();
// Allow requests from your Vite frontend
app.use(cors({
  origin: true, // process.env.CLIENT_URL
  credentials: true
}));

app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${req.method}] ${req.originalUrl}`);
    next();
});

// Middleware
app.use(express.json());
app.use('/api', router);

// Connect to database
connectDB();

app.listen(5000, '0.0.0.0', () => {
  console.log('Server listening on port 5000');
});
