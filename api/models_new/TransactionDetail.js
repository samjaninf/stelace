const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const TransactionDetailSchema = mongoose.Schema({
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
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
    label: String,
});

extendSchema(TransactionDetailSchema);

TransactionDetailSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('TransactionDetail', TransactionDetailSchema);
