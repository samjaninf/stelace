const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');

const { extendSchema } = require('./util');

const ApiKeySchema = mongoose.Schema({
    key: {
        type: String,
        required: true,
        index: true,
        unique: true,
    },
});

extendSchema(ApiKeySchema);
ApiKeySchema.plugin(uniqueValidator);

ApiKeySchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('ApiKey', ApiKeySchema);
