const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const ApiKeyEventSchema = mongoose.Schema({
    key: {
        type: String,
        required: true,
    },
    url: String,
});

extendSchema(ApiKeyEventSchema);

ApiKeyEventSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('ApiKeyEvent', ApiKeyEventSchema);
