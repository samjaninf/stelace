const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const GamificationEventSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    type: String,
    levelId: String,
    badgeId: String,
    actionId: String,
    points: Number,
    reference: Object,
});

extendSchema(GamificationEventSchema);

const params = {
    types: ["action", "badge", "level"],
};

GamificationEventSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "levelId",
            "badgeId",
            "actionId",
            "createdDate"
        ]
    };

    return accessFields[access];
};

GamificationEventSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

GamificationEventSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('GamificationEvent', GamificationEventSchema);
