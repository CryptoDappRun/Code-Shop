const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const cryptoPayments = require('../utils/cryptoPayments');
const paymentMethods = require('../utils/paymentMethods');
const axios = require('axios');

const BLOCKCYPHER_API_BASE = 'https://api.blockcypher.com/v1';
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

const priceCache = {};
const UseCoinGecko = false;

const staticPrices = {
    BTC: 100000,
    ETH: 3000,
    DOGE: 0.2,
    POL: 0.5,
    BNB: 3000,
    AVAX: 20
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function startBalancePolling() {

	const RollingDelay = parseInt(process.env.RollingDelay, 10) || 60000;
console.log("Start rolling...")

    setInterval(async () => {
        try {
            const pendingTransactions = await Transaction.find({ status: 'pending' }).populate('campaignId');
            if (pendingTransactions.length === 0) 
{
	console.log("No pending data...")
return;
} 
            	

            console.log(`Polling ${pendingTransactions.length} pending transactions...`);

            for (const transaction of pendingTransactions) {
                const { address, cryptoAmount, cryptoType, createdAt, privateKey } = transaction;

                const timeElapsed = Date.now() - new Date(createdAt).getTime();
                const orderExpiredTime = parseInt(process.env.OrderExpiredTime, 10) || 600000;
                if (timeElapsed > orderExpiredTime) {
                    transaction.status = 'expired';
                    await transaction.save();
                    console.log(`Transaction ${transaction._id} marked as expired (created ${Math.round(timeElapsed / 60000)} minutes ago)`);
                    continue;
                }

                let balance;
                if (cryptoType === 'BTC' || cryptoType === 'DOGE') {
                    let chain;
                    switch (cryptoType.toUpperCase()) {
                        case 'BTC': chain = 'btc/main'; break;
                        case 'DOGE': chain = 'doge/main'; break;
                        default: continue;
                    }
                    const response = await axios.get(`${BLOCKCYPHER_API_BASE}/${chain}/addrs/${address}/balance`);
                    const data = response.data;
                    balance = data.balance / 1e8;
                } else if (cryptoType === 'ETH' || cryptoType === 'POL' || cryptoType === 'BNB' || cryptoType === 'AVAX') {
                    const web3Instance = cryptoType === 'ETH' ? cryptoPayments.web3 :
                                         cryptoType === 'POL' ? cryptoPayments.polygonWeb3 :
                                         cryptoType === 'BNB' ? cryptoPayments.bscWeb3 :
                                         cryptoPayments.avaxWeb3;
                    const balanceWei = await web3Instance.eth.getBalance(address);
                    balance = web3Instance.utils.fromWei(balanceWei, 'ether');
                } else {
                    continue;
                }

                console.log(`Transaction ${transaction._id}: Balance=${balance} ${cryptoType}, Required=${cryptoAmount} ${cryptoType}`);

                if (balance >= cryptoAmount / 1e8) {
                    transaction.status = 'completed';
                    const campaign = transaction.campaignId;
                    const availableCode = campaign.codes.find(code => !code.isUsed);
                    if (availableCode) {
                        availableCode.isUsed = true; // Mark as used permanently
                        transaction.code = availableCode.code; // Assign to this transaction only
                        await campaign.save(); // Save campaign with updated code status
                    } else {
                        console.log(`No available codes for campaign ${campaign._id}`);
                        transaction.status = 'completed'; // Still complete, but no code assigned
                    }
                    await transaction.save();
                    console.log(`Transaction ${transaction._id} marked as completed${availableCode ? ` with code ${transaction.code}` : ' without code'}`);


//mark table as complete,then send crypto to admin with a delay.
await delay(10000);


                    const adminAddress = process.env[`ADMIN_${cryptoType.toUpperCase()}_ADDRESS`];
                    if (!adminAddress) {
                        console.error(`No admin address set for ${cryptoType} in .env`);
                        continue;
                    }

                    try {
                    	console.log(`Transfering ${amountSent} ${cryptoType} from ${address} to ${adminAddress}`);
                        const decryptedPrivateKey = cryptoPayments.decryptPrivateKey(privateKey);
                        const amountSent = await cryptoPayments.sendCrypto(cryptoType, address, decryptedPrivateKey, adminAddress, balance);
                        console.log(`Transferred ${amountSent} ${cryptoType} from ${address} to ${adminAddress}`);
                    } catch (transferError) {
                        console.error(`Failed to transfer ${cryptoType} for transaction ${transaction._id}:`, transferError.message);
                    }
                }

                await delay(3000);
            }
        } catch (error) {
            console.error('Polling error:', error.message);
        }
    }, RollingDelay);
}

startBalancePolling();

router.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await Campaign.find();
        const campaignsWithUnusedCodes = campaigns.map(campaign => ({
            ...campaign._doc,
            unusedCodesCount: campaign.codes.filter(code => !code.isUsed).length
        }));
        res.json(campaignsWithUnusedCodes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/payment-methods', (req, res) => {
    res.json(paymentMethods.getPaymentMethods());
});

router.post('/purchase', async (req, res) => {
    const { campaignId, cryptoType } = req.body;
    try {
        const campaign = await Campaign.findById(campaignId);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        const enabledMethods = paymentMethods.getPaymentMethods();
        if (!enabledMethods.includes(cryptoType)) {
            return res.status(400).json({ error: 'Payment method not enabled' });
        }

        const { address, privateKey } = cryptoPayments.generateAddress(cryptoType);
        const encryptedPrivateKey = cryptoPayments.encryptPrivateKey(privateKey);

        let cryptoPrice;
        const cacheKey = cryptoType.toUpperCase();
        const cacheEntry = priceCache[cacheKey];

        if (UseCoinGecko) {
            const cryptoMap = {
                'BTC': 'bitcoin',
                'ETH': 'ethereum',
                'DOGE': 'dogecoin',
                'POL': 'matic-network',
                'BNB': 'binancecoin',
                'AVAX': 'avalanche-2'
            };
            const coingeckoId = cryptoMap[cryptoType.toUpperCase()];
            if (!coingeckoId) throw new Error('Unsupported cryptocurrency');

            if (cacheEntry && (Date.now() - cacheEntry.timestamp < 300000)) {
                cryptoPrice = cacheEntry.price;
                console.log(`Using cached price for ${cryptoType}: $${cryptoPrice}`);
            } else {
                console.log(`Fetching price for ${coingeckoId} from CoinGecko...`);
                const priceResponse = await axios.get(`${COINGECKO_API_BASE}/simple/price`, {
                    params: {
                        ids: coingeckoId,
                        vs_currencies: 'usd'
                    }
                });
                console.log('CoinGecko response:', priceResponse.data);
                cryptoPrice = priceResponse.data[coingeckoId]?.usd;
                if (!cryptoPrice) throw new Error(`Failed to fetch price for ${coingeckoId}`);

                priceCache[cacheKey] = {
                    price: cryptoPrice,
                    timestamp: Date.now()
                };
            }
        } else {
            cryptoPrice = staticPrices[cryptoType.toUpperCase()];
            if (!cryptoPrice) throw new Error('Unsupported cryptocurrency');
            console.log(`Using static price for ${cryptoType}: $${cryptoPrice}`);
        }

        const usdAmount = campaign.isFree ? 0 : campaign.price;
        const cryptoAmount = usdAmount / cryptoPrice;

        const transaction = new Transaction({
            campaignId,
            address,
            amount: usdAmount,
            cryptoAmount,
            cryptoType,
            privateKey: encryptedPrivateKey,
            userId: req.session.user ? req.session.user.id : null
        });
        await transaction.save();

        res.json({
            paymentAddress: address,
            amount: usdAmount,
            cryptoAmount: cryptoAmount.toFixed(8),
            cryptoType,
            transactionId: transaction._id,
            description: campaign.description,
            image: campaign.image
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/check-payment/:transactionId', async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.transactionId);
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

        if (transaction.status === 'completed') {
            return res.json({ status: transaction.status, code: transaction.code || null });
        }

        const isPaid = transaction.amount === 0 || await cryptoPayments.checkPayment(
            transaction.address,
            transaction.cryptoAmount,
            transaction.cryptoType
        );

        if (isPaid && transaction.status === 'pending') {
            transaction.status = 'completed';
            const campaign = await Campaign.findById(transaction.campaignId);
            const availableCode = campaign.codes.find(code => !code.isUsed);
            if (availableCode) {
                availableCode.isUsed = true; // Mark as used permanently
                transaction.code = availableCode.code; // Assign to this transaction only
                await campaign.save(); // Save campaign with updated code status
            } else {
                console.log(`No available codes for campaign ${campaign._id}`);
            }
            await transaction.save();
        }

        res.json({
            status: transaction.status,
            code: transaction.code || null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/check-auth', (req, res) => {
    res.json({ isAuthenticated: !!req.session.user });
});

module.exports = router;