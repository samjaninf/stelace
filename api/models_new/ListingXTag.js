const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const ListingXTagSchema = mongoose.Schema({
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    tagId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
});

extendSchema(ListingXTagSchema);

ListingXTagSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('ListingXTag', ListingXTagSchema);
