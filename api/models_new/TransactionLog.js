const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const TransactionLogSchema = mongoose.Schema({
    eventType: String,
    resourceId: String,
    eventDate: Date,
});

extendSchema(TransactionLogSchema);

TransactionLogSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('TransactionLog', TransactionLogSchema);
