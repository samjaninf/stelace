const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const UserXTagSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    tagId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
});

extendSchema(UserXTagSchema);

UserXTagSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('UserXTag', UserXTagSchema);
