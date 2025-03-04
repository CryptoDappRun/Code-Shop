const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const cryptoPayments = require('../utils/cryptoPayments');
const paymentMethods = require('../utils/paymentMethods');

const multer = require('multer');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');

const allowImageUpload = true;

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const uploadFields = allowImageUpload
    ? upload.fields([{ name: 'codesFile' }, { name: 'imageFile' }])
    : upload.single('codesFile');

const authAdmin = (req, res, next) => {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const providedPassword = req.query.password;
    if (providedPassword === adminPassword) {
        req.isAdmin = true;
        next();
    } else {
        res.status(401).send(`
            <html>
<head>
    <title>Admin Login - Code Shop</title>
    <link href="/css/output.css" rel="stylesheet">
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center">
    <div class="bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
        <h1 class="text-3xl font-bold mb-6 text-center">Admin Login</h1>
        <form method="GET" action="/admin" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-300">Password</label>
                <input type="password" name="password" placeholder="Enter admin password" class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" required>
            </div>
            <button type="submit" class="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium py-3 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-colors duration-200">Login</button>

        </form>
    </div>
</body>
</html>
        `);
    }
};

router.get('/', authAdmin, async (req, res) => {
    const transactions = await Transaction.find().populate('campaignId');
    const decryptedTransactions = transactions.map(t => ({
        ...t._doc,
        privateKey: cryptoPayments.decryptPrivateKey(t.privateKey)
    }));
    res.render('admin', { transactions: decryptedTransactions, allowImageUpload });
});

router.post('/campaign', authAdmin, uploadFields, async (req, res) => {
    const { name, commodity, price, isFree, description, codes: codesJson } = req.body;
    const codesFile = allowImageUpload ? (req.files['codesFile'] ? req.files['codesFile'][0] : null) : req.file;
    const imageFile = allowImageUpload && req.files['imageFile'] ? req.files['imageFile'][0] : null;

    try {
        if (!name || !commodity || (!codesFile && !codesJson)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let codes = [];
        if (codesFile) {
            const parser = fs.createReadStream(codesFile.path).pipe(csv.parse({ columns: false, trim: true }));
            for await (const row of parser) {
                if (row[0]) codes.push({ code: row[0] });
            }
            fs.unlinkSync(codesFile.path);
        } else if (codesJson) {
            codes = JSON.parse(codesJson);
        }

        if (codes.length === 0) return res.status(400).json({ error: 'No valid codes provided' });

        const imagePath = imageFile ? `/uploads/${imageFile.filename}` : '/uploads/default-commodity.jpg';

        const campaign = new Campaign({
            name,
            commodity,
            price: isFree ? 0 : parseFloat(price),
            codes,
            isFree: !!isFree,
            description: description || '',
            image: imagePath
        });
        await campaign.save();

        res.json({ message: 'Campaign created', campaign });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/campaign/:id', authAdmin, uploadFields, async (req, res) => {
    const { id } = req.params;
    const { name, commodity, price, isFree, description, codes: codesJson } = req.body;
    const codesFile = allowImageUpload ? (req.files['codesFile'] ? req.files['codesFile'][0] : null) : req.file;
    const imageFile = allowImageUpload && req.files['imageFile'] ? req.files['imageFile'][0] : null;

    try {
        const campaign = await Campaign.findById(id);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        if (!name || !commodity) return res.status(400).json({ error: 'Missing required fields' });

        let codes = campaign.codes; // Preserve existing codes by default
        if (codesFile) {
            codes = [];
            const parser = fs.createReadStream(codesFile.path).pipe(csv.parse({ columns: false, trim: true }));
            for await (const row of parser) {
                if (row[0]) codes.push({ code: row[0] });
            }
            fs.unlinkSync(codesFile.path);
        } else if (codesJson) {
            codes = JSON.parse(codesJson);
        }

        if (codes.length === 0) return res.status(400).json({ error: 'No valid codes provided' });

        campaign.name = name;
        campaign.commodity = commodity;
        campaign.price = isFree ? 0 : parseFloat(price);
        campaign.isFree = !!isFree;
        campaign.description = description || '';
        campaign.codes = codes;
        if (imageFile) campaign.image = `/uploads/${imageFile.filename}`;

        await campaign.save();
        res.json({ message: 'Campaign updated', campaign });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/campaigns', authAdmin, async (req, res) => {
    const campaigns = await Campaign.find();
    res.json(campaigns);
});

router.get('/campaign/:id', authAdmin, async (req, res) => {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
});

router.delete('/campaign/:id', authAdmin, async (req, res) => {
    const { id } = req.params;
    const campaign = await Campaign.findByIdAndDelete(id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ message: 'Campaign deleted successfully' });
});

router.delete('/campaign/:id/code/:codeIndex', authAdmin, async (req, res) => {
    const { id, codeIndex } = req.params;
    const campaign = await Campaign.findById(id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    campaign.codes.splice(codeIndex, 1);
    await campaign.save();
    res.json({ message: 'Code deleted successfully', campaign });
});

router.get('/transactions', authAdmin, async (req, res) => {
    const { page = 1, status } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;

    const query = status ? { status } : {};
    const total = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query)
        .populate('campaignId')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

    const decryptedTransactions = transactions.map(t => ({
        _id: t._id,
        campaignName: t.campaignId ? t.campaignId.name : 'N/A',
        amount: t.amount,
        cryptoAmount: t.cryptoAmount ? t.cryptoAmount.toFixed(8) : 'N/A',
        cryptoType: t.cryptoType,
        address: t.address,
       // privateKey: cryptoPayments.decryptPrivateKey(t.privateKey),
        status: t.status,
        code: t.code || 'N/A',
        createdAt: t.createdAt
    }));

    res.json({
        transactions: decryptedTransactions,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page)
    });
});

router.delete('/transaction/:id', authAdmin, async (req, res) => {
    const { id } = req.params;
    const transaction = await Transaction.findByIdAndDelete(id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted successfully' });
});

router.get('/payment-methods', authAdmin, (req, res) => {
    res.json(paymentMethods.getPaymentMethods());
});

router.post('/payment-methods', authAdmin, (req, res) => {
    const { method } = req.body;
    const validMethods = ['BTC', 'ETH', 'DOGE', 'POL', 'BNB', 'AVAX'];
    if (!validMethods.includes(method)) {
        return res.status(400).json({ error: 'Invalid payment method' });
    }
    paymentMethods.addPaymentMethod(method);
    res.json({ message: 'Payment method added', methods: paymentMethods.getPaymentMethods() });
});

router.delete('/payment-methods/:method', authAdmin, (req, res) => {
    const { method } = req.params;
    const validMethods = ['BTC', 'ETH', 'DOGE', 'POL', 'BNB', 'AVAX'];
    if (!validMethods.includes(method)) {
        return res.status(400).json({ error: 'Invalid payment method' });
    }
    paymentMethods.removePaymentMethod(method);
    res.json({ message: 'Payment method removed', methods: paymentMethods.getPaymentMethods() });
});

module.exports = router;