const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const StelaceConfigSchema = mongoose.Schema({
    config: Object,
    features: Object,
});

extendSchema(StelaceConfigSchema);

StelaceConfigSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('StelaceConfig', StelaceConfigSchema);
