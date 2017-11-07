const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');

const { extendSchema } = require('./util');

const ListingTypeSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        index: true,
        unique: true,
    },
    properties: Object,
    config: Object,
    active: {
        type: Boolean,
        default: true,
    },
});

extendSchema(ListingTypeSchema);
ListingTypeSchema.plugin(uniqueValidator);

ListingTypeSchema.statics.getAccessFields = function (access) {
    const accessFields = {
        self: [
            'id',
            'name',
            'properties',
            'config',
            'active',
            'createdDate',
            'updatedDate',
        ],
    };

    return accessFields[access];
};

ListingTypeSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('ListingType', ListingTypeSchema);
