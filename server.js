const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Database connection
const connectDB = require('./config/db');

// Routes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

// Auth status check
app.get('/auth-status', (req, res) => {
    res.json({ loggedIn: !!req.session.user });
});

// Clear database (debugging only)
app.get('/clear-database', async (req, res) => {
    try {
        // Drop all collections
        await mongoose.connection.db.dropDatabase();
        console.log('Database cleared');
        res.json({ message: 'Database cleared successfully' });
    } catch (error) {
        console.error('Error clearing database:', error);
        res.status(500).json({ error: 'Failed to clear database' });
    }
});

// Connect to DB and start server
connectDB().then(() => {
    app.use('/api', apiRoutes);
    app.use('/admin', adminRoutes);
    app.use('/', userRoutes);

    app.get('/', (req, res) => {
        res.render('index', { user: req.session.user || null });
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
});