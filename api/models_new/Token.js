const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const TokenSchema = mongoose.Schema({
    type: String,
    value: {
        type: String,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    targetType: String,
    targetId: mongoose.Schema.Types.ObjectId,
    reference: Object,
    expirationDate: Date,
    usedDate: Date
});

extendSchema(TokenSchema);

TokenSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Token', TokenSchema);
