const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
    name: String,
    commodity: String,
    price: Number,
    codes: [{
        code: String,
        isUsed: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    }],
    isFree: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    description: { type: String, default: '' }, // Commodity description
    image: { type: String, default: '/uploads/default-commodity.jpg' } // Default image path
});

module.exports = mongoose.model('Campaign', CampaignSchema);