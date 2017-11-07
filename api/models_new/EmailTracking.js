const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');

const { extendSchema } = require('./util');

const EmailTrackingSchema = mongoose.Schema({
    mandrillMessageId: {
        type: String,
        index: true,
    },
    sparkpostTransmissionId: {
        type: String,
        index: true,
    },
    sparkpostMessageId: String,
    sparkpostBatchId: {
        type: String,
        index: true,
    },
    email: String,
    eventType: String,
    eventDate: Date,
    clickedUrl: String,
    ip: String,
    country: String,
    region: String,
    city: String,
    userAgent: String,
    mobile: Boolean,
    userAgentType: String,
    os: String,
    browser: String,
    syncAction: String,
    rejectReason: String,
    rejectExpirationDate: Date,
    data: Object,
});

extendSchema(EmailTrackingSchema);

EmailTrackingSchema.statics.getMandrillSignature = function (webhookKey, url, bodyParams) {
    var signedData = url;
    var bodyParamsKeys = _(bodyParams).keys().sortBy().value();

    _.forEach(bodyParamsKeys, function (bodyParamKey) {
        signedData += bodyParamKey;
        signedData += bodyParams[bodyParamKey];
    });

    return CryptoJS.HmacSHA1(signedData, webhookKey).toString(CryptoJS.enc.Base64);
};

EmailTrackingSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('EmailTracking', EmailTrackingSchema);
