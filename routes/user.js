const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).render('register', { error: 'Username and password required' });
        }
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).render('register', { error: 'Username already taken' });
        }
        const user = new User({ username, password });
        await user.save();
        req.session.user = { id: user._id, username: user.username };
        res.redirect('/panel');
    } catch (error) {
        res.status(500).render('register', { error: error.message });
    }
});

router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).render('login', { error: 'Invalid credentials' });
        }
        req.session.user = { id: user._id, username: user.username };
        res.redirect('/panel');
    } catch (error) {
        res.status(500).render('login', { error: error.message });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

router.get('/panel', isAuthenticated, async (req, res) => {
    const transactions = await Transaction.find({ userId: req.session.user.id }).populate('campaignId');
    res.render('panel', { user: req.session.user, transactions });
});

router.get('/order/:campaignId', isAuthenticated, async (req, res) => {
    const { campaignId } = req.params;
    try {
        const campaign = await Campaign.findById(campaignId);
        if (!campaign) {
            return res.status(404).render('error', { message: 'Campaign not found' });
        }
        res.render('order', { campaign, user: req.session.user });
    } catch (error) {
        res.status(500).render('error', { message: error.message });
    }
});

router.get('/transaction/:transactionId', isAuthenticated, async (req, res) => {
    const { transactionId } = req.params;
    try {
        const transaction = await Transaction.findById(transactionId).populate('campaignId');
        if (!transaction || transaction.userId.toString() !== req.session.user.id.toString()) {
            return res.status(404).render('error', { message: 'Transaction not found or not authorized' });
        }
        res.render('transaction', { transaction, user: req.session.user });
    } catch (error) {
        res.status(500).render('error', { message: error.message });
    }
});

router.get('/error', (req, res) => {
    res.render('error', { message: req.query.message || 'Something went wrong' });
});

module.exports = router;