const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const ListingCategorySchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    lft: Number,
    rgt: Number,
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
});

extendSchema(ListingCategorySchema);

ListingCategorySchema.statics.getAccessFields = function (access) {
    var accessFields = {
        others: [
            "id",
            "name",
            "lft",
            "rgt",
            "parentId"
        ]
    };

    return accessFields[access];
};

ListingCategorySchema.statics._createSpace = async function (left) {
    const listingCategories = await this.find({ rgt: { $gte: left } }).sort({ lft: 1 });
    await Promise.each(listingCategories, listingCategory => {
        listingCategory.rgt += 2;
        if (listingCategory.lft >= left) {
            listingCategory.lft += 2;
        }

        return listingCategory.save();
    });
}

ListingCategorySchema.statics._removeSpace = async function (left) {
    const listingCategories = await this.find({ rgt: { $gte: left } }).sort({ lft: 1 });
    await Promise.each(listingCategories, listingCategory => {
        listingCategory.rgt -= 2;
        if (listingCategory.lft >= left) {
            listingCategory.lft -= 2;
        }

        return listingCategory.save();
    });
};

ListingCategorySchema.methods.hasChildrenCategories = function () {
    return this.lft + 1 !== this.rgt;
};

ListingCategorySchema.statics.hasChildrenCategories = async function (categoryId) {
    const listingCategory = await this.findById(categoryId);
    if (!listingCategory) {
        const error = new Error("ListingCategory not found");
        error.listingCategoryId = categoryId;
        throw error;
    }

    return listingCategory.hasChildrenCategories();
};

ListingCategorySchema.statics.getChildrenCategories = async function (categoryId, includeSelf) {
    const listingCategory = await this.findById(categoryId);
    if (! listingCategory) {
        const error = new NotFoundError("ListingCategory not found");
        error.listingCategoryId = categoryId;
        throw error;
    }

    var findAttrs;
    if (includeSelf) {
        findAttrs = {
            lft: { $gte: listingCategory.lft },
            rgt: { $lte: listingCategory.rgt }
        };
    } else {
        findAttrs = {
            lft: { $gt: listingCategory.lft },
            rgt: { $lt: listingCategory.rgt }
        };
    }

    return await this.find(findAttrs).sort({ lft: 1 });
};

ListingCategorySchema.statics.getParentCategories = async function (categoryId, includeSelf) {
    const listingCategory = await this.findById(categoryId);
    if (! listingCategory) {
        const error = new NotFoundError("Listing category not found");
        error.listingCategoryId = categoryId;
        throw error;
    }

    if (! listingCategory.parentId) {
        return (includeSelf ? [listingCategory] : []);
    }

    var findAttrs;
    if (includeSelf) {
        findAttrs = {
            lft: { $lte: listingCategory.lft },
            rgt: { $gte: listingCategory.rgt }
        };
    } else {
        findAttrs = {
            lft: { $lt: listingCategory.lft },
            rgt: { $gt: listingCategory.rgt }
        };
    }

    return await this.find(findAttrs).sort({ lft: -1 });
};

/**
 * @param args
 * - *name
 * - parentId
 * - parent
 */
ListingCategorySchema.statics._insertIntoParent = async function (args) {
    var name     = args.name;
    var parentId = args.parentId;
    var parent   = args.parent;

    var createAttrs = {
        name: name,
        parentId: parentId
    };
    var needCreateSpace = false;

    const listingCategories = await this.find({ parentId });

    var sortedListingCategories = _.sortBy(listingCategories, function (listingCategory) {
        return listingCategory.name.toLowerCase();
    });
    var alphabeticallyNextListingCategory = _.find(sortedListingCategories, function (listingCategory) {
        return name.toLowerCase() < listingCategory.name.toLowerCase();
    });
    var lastListingCategory = _.last(sortedListingCategories);

    // if first level category and no category after the new one
    if (! parentId && ! alphabeticallyNextListingCategory) {
        // if the new category is the first one
        if (! lastListingCategory) {
            createAttrs.lft = 1;
            createAttrs.rgt = 2;
        } else {
            createAttrs.lft = lastListingCategory.rgt + 1;
            createAttrs.rgt = lastListingCategory.rgt + 2;
        }
    } else {
        needCreateSpace = true;

        if (alphabeticallyNextListingCategory) {
            createAttrs.lft = alphabeticallyNextListingCategory.lft;
            createAttrs.rgt = alphabeticallyNextListingCategory.lft + 1;
        } else {
            createAttrs.lft = parent.rgt;
            createAttrs.rgt = parent.rgt + 1;
        }
    }

    if (needCreateSpace) {
        await this._createSpace(createAttrs.lft);
    }

    return await this.create(createAttrs);
};

/**
 * @param args
 * - *name
 * - parentId
 */
ListingCategorySchema.statics.createListingCategory = async function (args) {
    var name     = args.name;
    var parentId = args.parentId;

    if (!parentId) {
        return await this._insertIntoParent({ name });
    }

    const listingCategory = await this.findById(parentId);
    if (! listingCategory) {
        const error = new NotFoundError("Parent category not found");
        error.listingCategoryId = parentId;
        throw error;
    }

    return await this._insertIntoParent({
        name,
        parentId,
        parent: listingCategory,
    });
};

ListingCategorySchema.statics.removeListingCategory = async function (categoryId) {
    const listingCategory = await this.findById(categoryId);
    if (!listingCategory) {
        const error = new NotFoundError("ListingCategory not found");
        error.listingCategoryId = categoryId;
        throw error;
    }
    if (listingCategory.hasChildrenCategories()) {
        throw new ForbiddenError("ListingCategory cannot be removed: has children categories");
    }

    await this.remove({ _id: listingCategory.id });
    await this._removeSpace(listingCategory.lft);
};

ListingCategorySchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('ListingCategory', ListingCategorySchema);
