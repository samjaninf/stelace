const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const RewardSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    type: String,
    triggerType: String,
    triggerId: String,
    targetType: String,
    targetId: mongoose.Schema.Types.ObjectId,
    reference: Object,
    usedDate: Date,
});

extendSchema(RewardSchema);

RewardSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Reward', RewardSchema);
