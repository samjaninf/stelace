const mongoose = require('mongoose');
const moment = require('moment');

const { extendSchema } = require('./util');
const TransactionDetail = require('./TransactionDetail');

const TransactionSchema = mongoose.Schema({
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    fromWalletId: String,
    toWalletId: String,
    bankAccountId: String,
    credit: {
        type: Number, // float
        default: 0,
    },
    debit: {
        type: Number, // float
        default: 0,
    },
    payment: {
        type: Number, // float
        default: 0,
    },
    cashing: {
        type: Number, // float
        default: 0,
    },
    preauthAmount: {
        type: Number, // float
        default: 0,
    },
    payoutAmount: {
        type: Number, // float
        default: 0,
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    resourceType: String,
    resourceId: String,
    preauthExpirationDate: Date,
    mgpCreatedDate: Date,
    executionDate: Date,
    cancelTransactionId: { // if set, this transaction cancels entirely or partially another one
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    action: String,
    label: String,
});

extendSchema(TransactionSchema);

// cannot cancel after "the expiration date - 5 minutes"
TransactionSchema.statics.isPreauthorizationCancellable = function (transaction) {
    var now = moment().toISOString();
    return now < moment(transaction.preauthExpirationDate).subtract(5, "m").toISOString();
};

TransactionSchema.statics.isValidTransactionsDetails = function (details) {
    return _.reduce(details, (memo, detail) => {
        if (! detail.label) {
            memo = memo && false;
        }
        return memo;
    }, true);
};

/**
 * create transaction details
 * @param  {number} transactionId
 * @param  {object} details
 * @param  {string} details.label
 * @param  {number} [details.credit = 0]
 * @param  {number} [details.debit = 0]
 * @param  {number} [details.payment = 0]
 * @param  {number} [details.cashing = 0]
 * @return {Promise<Array[object]>}
 */
TransactionSchema.statics.createTransactionDetails = async function (transactionId, details) {
    if (! this.isValidTransactionsDetails(details)) {
        throw new Error("Bad details");
    }
    return await Promise.mapSeries(details, detail => {
        var createAttrs = _.pick(detail, [
            "label",
            "credit",
            "debit",
            "payment",
            "cashing"
        ]);
        createAttrs.transactionId = transactionId;

        return TransactionDetail.create(createAttrs);
    });
};

/**
 * create transaction
 * @param  {object} args
 * @param  {number} args.fromUserId
 * @param  {number} args.toUserId
 * @param  {number} [args.fromWalletId]
 * @param  {number} [args.toWalletId]
 * @param  {number} [args.bankAccountId]
 * @param  {number} [args.preauthAmount = 0]
 * @param  {number} [args.payoutAmount = 0]
 * @param  {number} args.bookingId
 * @param  {string} args.resourceType
 * @param  {string} args.resourceId
 * @param  {string} [args.preauthExpirationDate]
 * @param  {string} [args.mgpCreatedDate]
 * @param  {string} [args.executionDate]
 * @param  {number} [args.cancelTransactionId]
 * @param  {string} args.action
 * @param  {string} args.label
 * @param  {object[]} [args.details = []]
 * @param  {string} args.details[].label
 * @param  {number} [args.details[].credit = 0]
 * @param  {number} [args.details[].debit = 0]
 * @param  {number} [args.details[].payment = 0]
 * @param  {number} [args.details[].cashing = 0]
 * @return {Promise<object>} res
 * @return {object}          res.transaction
 * @return {object[]}        res.transactionDetails
 */
TransactionSchema.statics.createTransaction = async function (args) {
    if (! args.fromUserId
     || ! args.resourceType
     || ! args.resourceId
     || ! args.action
     || ! args.label
     || (args.details && ! this.isValidTransactionsDetails(args.details))
    ) {
        throw new Error("Missing params");
    }

    var financeInfo = _.reduce(args.details, (memo, detail) => {
        if (typeof detail.credit === "number") {
            memo.credit += detail.credit;
        }
        if (typeof detail.debit === "number") {
            memo.debit += detail.debit;
        }
        if (typeof detail.payment === "number") {
            memo.payment += detail.payment;
        }
        if (typeof detail.cashing === "number") {
            memo.cashing += detail.cashing;
        }
        return memo;
    }, {
        credit: 0,
        debit: 0,
        payment: 0,
        cashing: 0
    });

    var createAttrs = _.pick(args, [
        "fromUserId",
        "toUserId",
        "fromWalletId",
        "toWalletId",
        "bankAccountId",
        "preauthAmount",
        "payoutAmount",
        "bookingId",
        "resourceType",
        "resourceId",
        "preauthExpirationDate",
        "mgpCreatedDate",
        "executionDate",
        "cancelTransactionId",
        "action",
        "label"
    ]);
    createAttrs = _.assign(createAttrs, financeInfo);

    var transaction = await this.create(createAttrs);
    var transactionDetails;

    if (args.details) {
        transactionDetails = await this.createTransactionDetails(transaction.id, args.details);
    }

    return {
        transaction: transaction,
        transactionDetails: transactionDetails || []
    };
};

TransactionSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Transaction', TransactionSchema);
