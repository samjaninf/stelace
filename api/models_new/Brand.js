const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');

const { extendSchema } = require('./util');

const BrandSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        index: true,
        unique: true,
    },
    listingCategories: [mongoose.Schema.Types.ObjectId],
});

extendSchema(BrandSchema);
BrandSchema.plugin(uniqueValidator);

BrandSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        others: [
            "id",
            "name"
        ]
    };

    return accessFields[access];
};

BrandSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Brand', BrandSchema);
