/* global GeneratorService */

const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const StelaceEventSchema = mongoose.Schema({
    label: String,
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    targetUserId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    tagsIds: [mongoose.Schema.Types.ObjectId],
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    searchId: mongoose.Schema.Types.ObjectId,
    loginAsUserId: { // not empty when admin logs as
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    fromExternal: {
        type: Boolean,
        default: false
    },
    type: String, // "click" or "view" for i.e.
    refererUrl: String,
    srcUrl: String,
    targetUrl: String,
    ip: String,
    lang: String,
    country: String,
    region: String,
    city: String,
    userAgent: String,
    os: String,
    browser: String,
    device: String,
    utmCampaign: String,
    utmSource: String,
    utmContent: String,
    utmMedium: String,
    utmTerm: String,
    token: String,
    scrollPercent: Number,
    data: Object,
    resetUser: Boolean,
    version: String,
});

extendSchema(StelaceEventSchema);

StelaceEventSchema.statics.getAccessFields = function (access) {
    const accessFields = {
        api: [
            'id',
            'label',
            'userId',
            'targetUserId',
            'listingId',
            'tagsIds',
            'bookingId',
            'type',
            'refererUrl',
            'srcUrl',
            'targetUrl',
            'country',
            'region',
            'city',
            'userAgent',
            'os',
            'browser',
            'data',
            'createdDate',
        ],
    };

    return accessFields[access];
};

StelaceEventSchema.pre('save', async function (next) {
    try {
        if (this.isNew) {
            this.token = await GeneratorService.getRandomString(10);
        }
        next();
    } catch (err) {
        next(err);
    }
});

StelaceEventSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('StelaceEvent', StelaceEventSchema);
