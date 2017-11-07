/* global GeneratorService */

const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const BookmarkSchema = mongoose.Schema({
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
    },
    type: String,
    active: {
        type: Boolean,
        default: true,
    },
    token: String,
    wishDate: Date, // start date of the future wished booking
    lastBookingId: mongoose.Schema.Types.ObjectId, // last booking id when send push email
    lastSentDate: Date,
    count: {
        type: Number,
        default: 0
    },
    reference: Object,
});

extendSchema(BookmarkSchema);

var params = {
    types: ["push"]    // add 'list' later
};

BookmarkSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "listingId",
            "userId",
            "type",
            "active",
            "token",
            "wishDate"
        ]
    };

    return accessFields[access];
};

BookmarkSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

BookmarkSchema.statics.isBookmarked = async function (listingId, userId) {
    const bookmark = await this.findOne({
        listingId: listingId,
        userId: userId,
        active: true,
    });

    return !!bookmark;
};

BookmarkSchema.pre('save', async function (next) {
    try {
        if (this.isNew) {
            this.token = await GeneratorService.getRandomString(20);
        }
        next();
    } catch (err) {
        next(err);
    }
});

BookmarkSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Bookmark', BookmarkSchema);
