const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const LinkSchema = mongoose.Schema({
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    relationship: String,
    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    validated: {
        type: Boolean,
        default: false,
    },
    email: {
        type: String,
        index: true,
    },
    source: String,
});

extendSchema(LinkSchema);

const params = {
    relationships: [
        "refer"
    ],
    sources: [
        "facebook",
        "twitter",
        "email"
    ]
};

LinkSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

LinkSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Link', LinkSchema);
