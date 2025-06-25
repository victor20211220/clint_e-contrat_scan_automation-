import mongoose from 'mongoose';

const SettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: String, default: null },
});

export default mongoose.model('Setting', SettingSchema);
