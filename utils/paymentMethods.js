//let enabledPaymentMethods = ['BTC', 'ETH', 'DOGE', 'POL', 'BNB', 'AVAX'];
let enabledPaymentMethods = [ 'ETH', 'POL', 'BNB', 'AVAX'];

module.exports = {
    getPaymentMethods: () => enabledPaymentMethods,
    setPaymentMethods: (methods) => {
        enabledPaymentMethods = methods;
        if (enabledPaymentMethods.length === 0) enabledPaymentMethods = ['BTC'];
    },
    addPaymentMethod: (method) => {
        const validMethods = enabledPaymentMethods;
        if (validMethods.includes(method) && !enabledPaymentMethods.includes(method)) {
            enabledPaymentMethods.push(method);
        }
    },
    removePaymentMethod: (method) => {
        enabledPaymentMethods = enabledPaymentMethods.filter(m => m !== method);
        if (enabledPaymentMethods.length === 0) enabledPaymentMethods = ['POL'];
    },

    getValidMethods: () => enabledPaymentMethods 
};