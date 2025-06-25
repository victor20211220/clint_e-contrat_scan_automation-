import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    name: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    is_admin: {type: Boolean, default: false},
});

export default mongoose.model('User', UserSchema);
