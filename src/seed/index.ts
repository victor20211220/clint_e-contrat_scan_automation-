import bcrypt from 'bcryptjs';
import connectDB from '../config/db';
import Setting from '../models/Setting';
import User from '../models/User';

const seed = async () => {
    await connectDB();

    await Setting.deleteMany({});
    await User.deleteMany({});

    await Setting.create({key: 'company_name', value: 'Microsoft'});

    const hashedPassword = await bcrypt.hash('123', 10);
    await User.create({name: 'admin', password: hashedPassword, is_admin: true});

    console.log('✅ Seed completed');
    process.exit();
};

seed();
