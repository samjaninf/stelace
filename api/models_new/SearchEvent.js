const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const SearchEventSchema = mongoose.Schema({
    type: String,
    userId: mongoose.Schema.Types.ObjectId,
    tagsIds: [mongoose.Schema.Types.ObjectId],
    listingTypeId: mongoose.Schema.Types.ObjectId,
    query: String,
    page: Number,
    limit: Number,
    params: Object,
    os: String,
    browser: String,
    device: String,
    userAgent: String,
    completionDuration: Number, // in milliseconds
});

extendSchema(SearchEventSchema);

SearchEventSchema.statics.getAccessFields = function (access) {
    const accessFields = {
        self: [
            'id',
            'type',
            'userId',
            'tagsIds',
            'listingTypeId',
            'query',
            'page',
            'limit',
            'params',
            'createdDate',
        ],
    };

    return accessFields[access];
};

SearchEventSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('SearchEvent', SearchEventSchema);
