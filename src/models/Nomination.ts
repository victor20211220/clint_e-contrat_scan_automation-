import mongoose from 'mongoose';

const NominationSchema = new mongoose.Schema({
  contract_name: { type: String, required: true },
  seller: { type: String, required: true },
  buyer: { type: String, required: true },
  arrival_period: { type: Date, required: true },
  nomination_date: { type: Date, required: true },
  nomination_type: { type: String, required: true },
  nomination_keyword: { type: String, required: true },
  nomination_description: { type: String, required: true },
  for_seller_or_buyer: { type: String, enum: ['seller', 'buyer'], default: 'seller' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sent: { type: Boolean, default: false },
  received: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Nomination', NominationSchema);
