/* global GeneratorService */

const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const StelaceSessionSchema = mongoose.Schema({
    lastEventDate: Date,
    refererUrl: String,
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    ip: String,
    lang: String,
    country: String,
    region: String,
    city: String,
    userAgent: String,
    os: String,
    browser: String,
    device: String,
    startUtmCampaign: String,
    startUtmSource: String,
    startUtmContent: String,
    startUtmMedium: String,
    startUtmTerm: String,
    endUtmCampaign: String,
    endUtmSource: String,
    endUtmContent: String,
    endUtmMedium: String,
    endUtmTerm: String,
    width: Number,
    height: Number,
    token: String,
});

extendSchema(StelaceSessionSchema);

StelaceSessionSchema.pre('save', async function (next) {
    try {
        if (this.isNew) {
            this.token = await GeneratorService.getRandomString(10);
        }
        next();
    } catch (err) {
        next(err);
    }
});

StelaceSessionSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('StelaceSession', StelaceSessionSchema);
