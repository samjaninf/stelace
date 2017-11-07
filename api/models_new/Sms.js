const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const SmsSchema = mongoose.Schema({
    // Sending request attributes
    userId: { // user id, nexmo 'client-ref'
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    from: String,
    to: String,
    countryCode: String,
    reason: String, // "phoneCheck" or "inbound" or messageId for automatic answers (future use)
    type: String, // 'text' (corresponds to Nexmo default's text 'type'), or 'verify'
    text: String,

    // Response attributes
    verifyId: String, // Nexmo Verify API 'request_id'
    verifyStatus: String, // 0 means success
    messageId: String, // nexmo 'message-id' or call-id in Nexmo Verify API
    price: Number, // float
    remainingBalance: Number, // float,
    providerStatusCode: String, //nexmo 'status' in first request response
    providerError: String, // nexmo 'error-text' or 'error_text' in verify  API
    messagesCount: Number, // 'sms-text' type only : number of message's parts nexmo 'message-count'

    // Delevery receipt attributes (a dedicated log table may be needed if many fails)
    delivered: Boolean,
    deliveryStatus: String, //nexmo DLR 'status'
    deliveryError: String, // nexmo DLR 'err-code'
    deliveryTime: String, // nexmo DLR 'scts'
    providerTimestamp: String, // nexmo dlr 'message-timestamp'
    updateCount: {
        type: Number,
        default: 0,
    },
});

extendSchema(SmsSchema);

const params = {
    senderId: '',
};

SmsSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

SmsSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Sms', SmsSchema);
