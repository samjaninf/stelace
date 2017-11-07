/* global IPService */

const mongoose = require('mongoose');
const useragent = require('useragent');

const { extendSchema } = require('./util');
const Card = require('./Card');

const PaymentErrorSchema = mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    bookingId: mongoose.Schema.Types.ObjectId,
    cardId: mongoose.Schema.Types.ObjectId,
    cardNumber: String,
    message: String,
    code: String,
    amount: Number, // float
    ip: String,
    country: String,
    region: String,
    city: String,
    userAgent: String,
    os: String,
    browser: String,
    device: String,
    url: String,
    refererUrl: String,
    data: Object,
});

extendSchema(PaymentErrorSchema);

/**
 * Create payment error
 * @param  {object} preauthorization
 * @param  {ObjectId} userId
 * @param  {ObjectId} bookingId
 * @param  {ObjectId} cardId
 * @param  {object} [req]
 * @return {object}
 */
PaymentErrorSchema.statics.createError = async function ({
    preauthorization,
    userId,
    bookingId,
    cardId,
    req,
}) {
    // if there is no preauthorization or it's not a failed one
    if (!preauthorization || preauthorization.Status !== 'FAILED') {
        return;
    }

    const createAttrs = {
        userId,
        bookingId,
        cardId,
    };
    const data = {
        preauthorization: preauthorization,
    };

    createAttrs.message = preauthorization.ResultMessage;
    createAttrs.code = preauthorization.ResultCode;
    createAttrs.amount = preauthorization.DebitedFunds && preauthorization.DebitedFunds.Amount / 100;

    if (req) {
        createAttrs.url = sails.config.stelace.url + req.url;
        createAttrs.refererUrl = req.headers.referer;

        const userAgent = req.headers['user-agent'];
        createAttrs.userAgent = userAgent;

        if (userAgent) {
            const parsedUserAgent = useragent.parse(userAgent);
            createAttrs.os = parsedUserAgent.os.toString();
            createAttrs.browser = parsedUserAgent.toString();
            createAttrs.device = parsedUserAgent.device.toString();
        }

        createAttrs.ip = req.ip;
        if (req.ip) {
            const ipInfo = await IPService.getInfo(req.ip);
            createAttrs.country = ipInfo.country;
            createAttrs.region = ipInfo.region;
            createAttrs.city = ipInfo.city;
        }
    }

    if (cardId) {
        const card = await Card.findById(cardId).catch(() => null);
        if (card) {
            createAttrs.cardNumber = card.alias;
        }
    }

    createAttrs.data = data;

    return await this.create(createAttrs);
};

PaymentErrorSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('PaymentError', PaymentErrorSchema);
