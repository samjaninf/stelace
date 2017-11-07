/* global ToolsService */

const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const TagSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    nameURLSafe: String,
    listingCategoryIds: [mongoose.Schema.Types.ObjectId],
    validated: {
        type: Boolean,
        default: false,
    },
    priorityScore: {
        type: Number,
        default: 0,
    },
    timesSearched: {
        type: Number,
        default: 0,
    },
    timesSearchedSimilar: {
        type: Number,
        default: 0,
    },
    timesAdded: {
        type: Number,
        default: 0,
    },
});

extendSchema(TagSchema);

TagSchema.statics.getAccessFields = function (access) {
    const accessFields = {
        others: [
            'id',
            'name',
            'nameURLSafe',
            'listingCategoryIds',
            'validated',
            'priorityScore',
            'timesSearched',
            'timesSearchedSimilar',
            'timesAdded',
        ],
    };

    return accessFields[access];
};

TagSchema.pre('save', function (next) {
    if (this.name) {
        this.nameURLSafe = ToolsService.getURLStringSafe(this.name);
    }
    next();
});

TagSchema.pre('update', function (next) {
    const updateQuery = this.getUpdate();

    if (updateQuery.$set.name) {
        this.update({}, {
            nameURLSafe: ToolsService.getURLStringSafe(updateQuery.$set.name),
        });
    }
    next();
});

TagSchema.pre('updateOne', function (next) {
    const updateQuery = this.getUpdate();

    if (updateQuery.$set.name) {
        this.update({}, {
            nameURLSafe: ToolsService.getURLStringSafe(updateQuery.$set.name),
        });
    }
    next();
});

TagSchema.pre('findOneAndUpdate', function (next) {
    const updateQuery = this.getUpdate();

    if (updateQuery.name) {
        this.findOneAndUpdate({}, {
            nameURLSafe: ToolsService.getURLStringSafe(updateQuery.name),
        });
    }
    next();
});

TagSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Tag', TagSchema);
