const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    address: String,
    amount: Number, // USD amount
    cryptoAmount: Number, // Crypto amount (e.g., BTC, ETH)
    cryptoType: String,
    status: { type: String, default: 'pending' },
    privateKey: String,
    createdAt: { type: Date, default: Date.now },
    code: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

module.exports = mongoose.model('Transaction', TransactionSchema);