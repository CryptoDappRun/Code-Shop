const bitcoin = require('bitcoinjs-lib');
const { Web3 } = require('web3');
const crypto = require('crypto');
const axios = require('axios');

const DOGECOIN_NETWORK = {
    messagePrefix: '\x19Dogecoin Signed Message:\n',
    bip32: {
        public: 0x02facafd,
        private: 0x02fac398
    },
    pubKeyHash: 0x1e,
    scriptHash: 0x16,
    wif: 0x9e
};

class CryptoPayments {
    constructor() {
        this.web3 = new Web3(process.env.ETH_NODE_URL);
        this.polygonWeb3 = new Web3(process.env.POLYGON_NODE_URL);
        this.bscWeb3 = new Web3(process.env.BSC_NODE_URL);
        this.avaxWeb3 = new Web3(process.env.AVAX_NODE_URL);
    }

    generateAddress(cryptoType) {
        switch (cryptoType.toUpperCase()) {
            case 'BTC':
                const btcKeyPair = bitcoin.ECPair.makeRandom();
                const btcPayment = bitcoin.payments.p2pkh({ pubkey: btcKeyPair.publicKey });
                return { address: btcPayment.address, privateKey: btcKeyPair.toWIF() };
            case 'ETH':
                const ethAccount = this.web3.eth.accounts.create();
                return { address: ethAccount.address, privateKey: ethAccount.privateKey };
            case 'DOGE':
                const dogeKeyPair = bitcoin.ECPair.makeRandom({ network: DOGECOIN_NETWORK });
                const dogePayment = bitcoin.payments.p2pkh({ 
                    pubkey: dogeKeyPair.publicKey, 
                    network: DOGECOIN_NETWORK 
                });
                return { address: dogePayment.address, privateKey: dogeKeyPair.toWIF() };
            case 'POL':
                const polAccount = this.polygonWeb3.eth.accounts.create();
                return { address: polAccount.address, privateKey: polAccount.privateKey };
            case 'BNB':
                const bscAccount = this.bscWeb3.eth.accounts.create();
                return { address: bscAccount.address, privateKey: bscAccount.privateKey };
            case 'AVAX':
                const avaxAccount = this.avaxWeb3.eth.accounts.create();
                return { address: avaxAccount.address, privateKey: avaxAccount.privateKey };
            default:
                throw new Error('Unsupported cryptocurrency');
        }
    }

    encryptPrivateKey(privateKey) {
        if (!privateKey) return null;
        const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    decryptPrivateKey(encryptedKey) {
        if (!encryptedKey) return null;
        const decipher = crypto.createDecipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
        let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    async checkPayment(address, amount, cryptoType) {
        switch (cryptoType.toUpperCase()) {
            case 'BTC':
                return this.checkBtcPayment(address, amount);
            case 'ETH':
                return this.checkEthPayment(address, amount, this.web3);
            case 'DOGE':
                return this.checkDogePayment(address, amount);
            case 'POL':
                return this.checkEthPayment(address, amount, this.polygonWeb3);
            case 'BNB':
                return this.checkEthPayment(address, amount, this.bscWeb3);
            case 'AVAX':
                return this.checkEthPayment(address, amount, this.avaxWeb3);
            default:
                throw new Error('Unsupported cryptocurrency');
        }
    }

    async checkBtcPayment(address, amount) {
        const response = await axios.get(`https://blockchain.info/q/addressbalance/${address}`);
        const balance = response.data / 1e8;
        return balance >= amount;
    }

    async checkEthPayment(address, amount, web3Instance) {
        const balanceWei = await web3Instance.eth.getBalance(address);
        const balanceEth = web3Instance.utils.fromWei(balanceWei, 'ether');
        return parseFloat(balanceEth) >= amount;
    }

    async checkDogePayment(address, amount) {
        const response = await axios.get(`https://api.blockcypher.com/v1/doge/main/addrs/${address}/balance`);
        const balance = response.data.balance / 1e8;
        return balance >= amount;
    }

    async sendCrypto(cryptoType, fromAddress, privateKey, toAddress, amount) {
        switch (cryptoType.toUpperCase()) {
            case 'BTC':
                const btcNetwork = bitcoin.networks.bitcoin;
                const btcKeyPair = bitcoin.ECPair.fromWIF(privateKey, btcNetwork);
                const btcPsbt = new bitcoin.Psbt({ network: btcNetwork });

                const btcUtxoResponse = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${fromAddress}?unspentOnly=true`);
                const btcUtxos = btcUtxoResponse.data.txrefs || [];
                if (!btcUtxos.length) throw new Error('No UTXOs found for BTC');

                const btcTotalInput = btcUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
                const btcFee = 10000; // 0.0001 BTC (in satoshi), adjust as needed
                const btcAmountToSend = (btcTotalInput - btcFee) / 1e8;

                if (btcAmountToSend <= 0) throw new Error('Insufficient BTC balance for transaction');

                btcUtxos.forEach(utxo => {
                    btcPsbt.addInput({
                        hash: utxo.tx_hash,
                        index: utxo.tx_output_n,
                        nonWitnessUtxo: Buffer.from(utxo.tx_hex, 'hex')
                    });
                });

                btcPsbt.addOutput({
                    address: toAddress,
                    value: Math.floor(btcAmountToSend * 1e8)
                });

                btcPsbt.signAllInputs(btcKeyPair);
                btcPsbt.finalizeAllInputs();
                const btcTx = btcPsbt.extractTransaction();
                const btcTxHex = btcTx.toHex();

                await axios.post('https://api.blockcypher.com/v1/btc/main/txs/push', { tx: btcTxHex });
                return btcAmountToSend;

            case 'ETH':
            case 'POL':
            case 'BNB':
            case 'AVAX':
                const web3Instance = cryptoType === 'ETH' ? this.web3 :
                                     cryptoType === 'POL' ? this.polygonWeb3 :
                                     cryptoType === 'BNB' ? this.bscWeb3 :
                                     this.avaxWeb3;
                const account = web3Instance.eth.accounts.privateKeyToAccount(privateKey);
                const ethBalanceWei = await web3Instance.eth.getBalance(fromAddress);
                const gasPrice = await web3Instance.eth.getGasPrice();
                const gasLimit = 21000;
                const ethGasCost = gasPrice * BigInt(gasLimit);
                const ethAmountToSendWei = BigInt(ethBalanceWei) - ethGasCost;

                if (ethAmountToSendWei <= 0) throw new Error(`Insufficient ${cryptoType} balance for gas`);

                const ethTx = {
                    from: fromAddress,
                    to: toAddress,
                    value: ethAmountToSendWei.toString(),
                    gas: gasLimit,
                    gasPrice: gasPrice.toString()
                };

                const signedEthTx = await account.signTransaction(ethTx);
                const receipt = await web3Instance.eth.sendSignedTransaction(signedEthTx.rawTransaction);
                return web3Instance.utils.fromWei(ethAmountToSendWei, 'ether');

            case 'DOGE':
                const dogeNetwork = DOGECOIN_NETWORK;
                const dogeKeyPair = bitcoin.ECPair.fromWIF(privateKey, dogeNetwork);
                const dogePsbt = new bitcoin.Psbt({ network: dogeNetwork });

                const dogeUtxoResponse = await axios.get(`https://api.blockcypher.com/v1/doge/main/addrs/${fromAddress}?unspentOnly=true`);
                const dogeUtxos = dogeUtxoResponse.data.txrefs || [];
                if (!dogeUtxos.length) throw new Error('No UTXOs found for DOGE');

                const dogeTotalInput = dogeUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
                const dogeFee = 100000000; // 1 DOGE (in satoshi)
                const dogeAmountToSend = (dogeTotalInput - dogeFee) / 1e8;

                if (dogeAmountToSend <= 0) throw new Error('Insufficient DOGE balance for transaction');

                dogeUtxos.forEach(utxo => {
                    dogePsbt.addInput({
                        hash: utxo.tx_hash,
                        index: utxo.tx_output_n,
                        nonWitnessUtxo: Buffer.from(utxo.tx_hex, 'hex')
                    });
                });

                dogePsbt.addOutput({
                    address: toAddress,
                    value: Math.floor(dogeAmountToSend * 1e8)
                });

                dogePsbt.signAllInputs(dogeKeyPair);
                dogePsbt.finalizeAllInputs();
                const dogeTx = dogePsbt.extractTransaction();
                const dogeTxHex = dogeTx.toHex();

                await axios.post('https://api.blockcypher.com/v1/doge/main/txs/push', { tx: dogeTxHex });
                return dogeAmountToSend;

            default:
                throw new Error('Unsupported cryptocurrency');
        }
    }
}

module.exports = new CryptoPayments();