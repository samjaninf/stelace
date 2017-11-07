const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const CancellationSchema = mongoose.Schema({
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    reasonType: String,
    reason: String,
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    takerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    trigger: String,
    refundDate: Date,
});

extendSchema(CancellationSchema);

var params = {
    triggers: ["owner", "taker"],
    reasonTypes: [
        // automatically cancelled reason types
        "no-action",
        "no-validation",
        "no-payment",
        "out-of-stock",

        "rejected",
        "taker-cancellation",

        "assessment-missed",
        "assessment-refused",

        "other"
    ],
    cancelPaymentReasonTypes: [
        "no-action",
        "no-validation",
        "no-payment",
        "out-of-stock",
        "rejected"
    ]
};

CancellationSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [ // req.user.id in (ownerId || taker)
            "id",
            "listingId",
            "reasonType",
            "reason",
            "createdDate",
            "ownerId",
            "takerId",
            "trigger"
        ],
        others: [
            "id",
            "listingId",
            "createdDate"
        ]
    };

    return accessFields[access];
};

CancellationSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

CancellationSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Cancellation', CancellationSchema);
