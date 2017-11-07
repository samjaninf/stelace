/* global ElasticsearchService, ToolsService */

const mongoose = require('mongoose');

const { extendSchema } = require('./util');
const Brand = require('./Brand');
const Booking = require('./Booking');
const ListingCategory = require('./ListingCategory');
const Media = require('./Media');
const ListingXTag = require('./ListingXTag');
const ModelSnapshot = require('./ModelSnapshot');
const Tag = require('./Tag');

const ListingSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    nameURLSafe: String,
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    nbViews: {
        type: Number,
        default: 0,
    },
    nbContacts: {
        type: Number,
        default: 0,
    },
    nbBookings: {
        type: Number,
        default: 0,
    },
    description: {
        type: String,
        maxLength: 3000,
    },
    stateComment: {
        type: String,
        maxLength: 1000,
    },
    bookingPreferences: {
        type: String,
        maxLength: 1000,
    },
    brandId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    reference: String,
    listingCategoryId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    mediasIds: [mongoose.Schema.Types.ObjectId],
    instructionsMediasIds: [mongoose.Schema.Types.ObjectId],
    validated: {
        type: Boolean,
        default: false,
    },
    validationPoints: {
        type: Number,
        default: 5,
    },
    validation: {
        type: Boolean,
        default: false,
    },
    validationFields: [String],
    ratingScore: {
        type: Number,
        default: 0,
    },
    nbRatings: {
        type: Number,
        default: 0,
    },
    autoBookingAcceptation: {
        type: Boolean,
        default: false,
    },
    locations: [mongoose.Schema.Types.ObjectId],
    broken: {
        type: Boolean,
        default: false,
    },
    locked: {
        type: Boolean,
        default: false,
    },
    publishedDate: Date,
    pausedUntil: Date,
    listingTypesIds: [mongoose.Schema.Types.ObjectId],
    quantity: {
        type: Number,
        default: 1,
    },
    sellingPrice: Number, // float
    dayOnePrice: {
        type: Number, // float
        required: true,
    },
    pricingId: {
        type: Number,
        required: true,
    },
    customPricingConfig: Object,
    deposit: {
        type: Number, // float
        required: true,
    },
    acceptFree: {
        type: Boolean,
        default: false,
    },
});

extendSchema(ListingSchema);

ListingSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "name",
            "nameURLSafe",
            "nbViews",
            "nbContacts",
            "nbBookings",
            "description",
            "tags",
            "completeTags",
            "stateComment",
            "bookingPreferences",
            "accessories",
            "ownerId",
            "brandId",
            "reference",
            "listingCategoryId",
            "validated",
            "ratingScore",
            "nbRatings",
            "locations",
            "broken",
            "locked",
            "publishedDate",
            "pausedUntil",
            "listingTypesIds",
            "listingTypes", // due to expose transform
            "quantity",
            "dayOnePrice",
            "sellingPrice",
            "pricingId",
            "customPricingConfig",
            "deposit",
            "acceptFree",
            "createdDate",
            "updatedDate",
            "snapshot" // set when getting snapshots
        ],
        others: [
            "id",
            "name",
            "nameURLSafe",
            "description",
            "tags",
            "completeTags",
            "stateComment",
            "bookingPreferences",
            "accessories",
            "ownerId",
            "brandId",
            "reference",
            "listingCategoryId",
            "validated",
            "ratingScore",
            "nbRatings",
            "locations",
            "broken",
            "locked",
            "listingTypesIds",
            "listingTypes", // due to expose transform
            "quantity",
            "dayOnePrice",
            "sellingPrice",
            "pricingId",
            "customPricingConfig",
            "deposit",
            "acceptFree",
            "createdDate",
            "updatedDate",
            "snapshot" // set when getting snapshots
        ]
    };

    return accessFields[access];
};

ListingSchema.statics.isBookable = function (listing) {
    if (listing.broken || listing.locked) {
        return false;
    }

    return true;
};

/**
 * get bookings from listings that are paid and accepted
 * @param  {ObjectId[]} listingsIds
 * @param  {object} [args]
 * @param  {string} [args.minStartDate] - filter bookings that start after that date included
 * @param  {string} [args.maxStartDate] - filter bookings that start before that date not included
 * @param  {string} [args.minEndDate]   - filter bookings that end after that date included
 * @param  {string} [args.maxEndDate]   - filter bookings that end before that date not included
 * @return {Promise<object[]>} - bookings
 */
ListingSchema.statics.getBookings = async function (listingsIds, args) {
    args = args || {};

    var findAttrs = {};

    var startPeriod = ToolsService.getPeriodAttrs(args.minStartDate, args.maxStartDate);
    var endPeriod   = ToolsService.getPeriodAttrs(args.minEndDate, args.maxEndDate);

    if (startPeriod) {
        findAttrs.startDate = startPeriod;
    }
    if (endPeriod) {
        findAttrs.endDate = endPeriod;
    }

    findAttrs.listingId         = listingsIds;
    findAttrs.cancellationId = null;
    findAttrs.paidDate       = { $ne: null };
    findAttrs.acceptedDate   = { $ne: null };

    return await Booking
        .find(findAttrs)
        .sort({ startDate: 1 });
};

ListingSchema.statics.getFutureBookings = async function (listingIdOrIds, refDate) {
    var onlyOne;
    var listingsIds;

    if (_.isArray(listingIdOrIds)) {
        listingsIds = _.uniq(listingIdOrIds);
        onlyOne = false;
    } else {
        listingsIds = [listingIdOrIds];
        onlyOne = true;
    }

    // get bookings that end after the ref date
    var bookings = await this.getBookings(listingsIds, { minEndDate: refDate });

    var hashBookings = _.groupBy(bookings, "listingId");

    hashBookings = _.reduce(listingsIds, function (memo, listingId) {
        memo[listingId] = hashBookings[listingId] || [];
        return memo;
    }, {});

    if (onlyOne) {
        return hashBookings[listingIdOrIds];
    } else {
        return hashBookings;
    }
};

ListingSchema.statics.updateTags = async function (listing, tagIds) {
    if (! µ.checkArray(tagIds, "mongoId")) {
        throw new BadRequestError();
    }

    var listingXTags = await ListingXTag.find({ listingId: listing.id });

    const tagIdsStr = _.map(tagIds, µ.getObjectIdString);
    const oldTagIdsStr = _.map(_.pluck(listingXTags, "tagId"), µ.getObjectIdString);

    var addedTagIds   = _.difference(tagIdsStr, oldTagIdsStr);
    var removedTagIds = _.difference(oldTagIdsStr, tagIdsStr);

    if (addedTagIds.length) {
        await Promise.each(addedTagIds, tagId => {
            return ListingXTag.create({
                listingId: listing.id,
                tagId: tagId
            });
        });
    }
    if (removedTagIds.length) {
        await ListingXTag.remove({
            listingId: listing.id,
            tagId: removedTagIds
        });
    }

    ElasticsearchService.shouldSyncListings([listing.id]);

    return listing;
}

/**
 * @param args
 * - brandId
 * - listingCategoryId
 */
ListingSchema.statics.isValidReferences = async function (args) {
    var brandId        = args.brandId;
    var listingCategoryId = args.listingCategoryId;

    const [
        existsBrand,
        existsListingCategory
     ] = await Promise.all([
        brandId ? Brand.findById(brandId) : true,
        listingCategoryId ? ListingCategory.findById(listingCategoryId) : true,
    ]);

    return !!existsBrand && !!existsListingCategory;
}

/**
 * get medias from listings
 * @param  {object[]} listings
 * @return {object}   hashMedias
 * @return {object[]} hashMedias[listingId] - listing medias
 */
ListingSchema.statics.getMedias = async function (listings) {
    var mediasIds = _.reduce(listings, function (memo, listing) {
        memo = memo.concat(listing.mediasIds || []);
        return memo;
    }, []);
    mediasIds = _.uniq(mediasIds);

    var medias = await Media.find({ _id: mediasIds });
    var indexedMedias = _.indexBy(medias, "id");

    return _.reduce(listings, function (memo, listing) {
        if (! memo[listing.id]) { // in case there are duplicate listings in listings array
            memo[listing.id] = _.reduce(listing.mediasIds || [], function (memo2, mediaId) {
                var media = indexedMedias[mediaId];
                if (media) {
                    memo2.push(media);
                }
                return memo2;
            }, []);
        }

        return memo;
    }, {});
}

/**
 * get instructions medias from listings
 * @param  {object[]} listings
 * @return {object}   hashMedias
 * @return {object[]} hashMedias[listingId] - listing instructions medias
 */
ListingSchema.statics.getInstructionsMedias = async function (listings) {
    var mediasIds = _.reduce(listings, function (memo, listing) {
        memo = memo.concat(listing.instructionsMediasIds || []);
        return memo;
    }, []);
    mediasIds = _.uniq(mediasIds);

    var medias = await Media.find({ _id: mediasIds });
    var indexedMedias = _.indexBy(medias, "id");

    return _.reduce(listings, function (memo, listing) {
        if (! memo[listing.id]) {
            memo[listing.id] = _.reduce(listing.instructionsMediasIds || [], function (memo2, mediaId) {
                var media = indexedMedias[mediaId];
                if (media) {
                    memo2.push(media);
                }
                return memo2;
            }, []);
        }

        return memo;
    }, {});
};

ListingSchema.statics.getTags = async function (listingOrListings, completeObj) {
    var listings;

    if (_.isArray(listingOrListings)) {
        listings = listingOrListings;
    } else {
        listings = [listingOrListings];
    }

    const listingXTags = await ListingXTag.find({ listingId: _.pluck(listings, "id") });
    let tags;

    if (! completeObj || ! listingXTags.length) {
        tags = [];
    } else {
        var tagIds = _.uniq(_.pluck(listingXTags, "tagId"));
        tags = await Tag.find({ _id: tagIds });
    }

    var hashTags = _.indexBy(tags, "id");

    var hashListingXTags = _.reduce(listingXTags, function (memo, listingXTag) {
        if (memo[listingXTag.listingId]) {
            memo[listingXTag.listingId].push(listingXTag.tagId);
        } else {
            memo[listingXTag.listingId] = [listingXTag.tagId];
        }
        return memo;
    }, {});


    _.forEach(listings, function (listing) {
        if (hashListingXTags[listing.id]) {
            listing.tags = hashListingXTags[listing.id];
        } else {
            listing.tags = [];
        }

        if (completeObj) {
            listing.completeTags = _.map(listing.tags, function (tagId) {
                return hashTags[tagId];
            });
        }
    });

    return listingOrListings;
};

ListingSchema.statics.getListingsOrSnapshots = async function (listingIdOrListingsIds) {
    var listingsIds;
    var onlyOne;

    if (_.isArray(listingIdOrListingsIds)) {
        listingsIds = _.uniq(listingIdOrListingsIds);
        onlyOne  = false;
    } else {
        listingsIds = [listingIdOrListingsIds];
        onlyOne  = true;
    }

    var listings = await this.find({ _id: listingsIds });

    const listingsIdsStr = _.map(listingsIds, µ.getObjectIdString);
    var foundListingsIds    = _.pluck(listings, "id").map(µ.getObjectIdString);
    var notFoundListingsIds = _.difference(listingsIdsStr, foundListingsIds);

    // no need to get snapshots if all listings are found
    if (listingsIds.length === foundListingsIds.length) {
        if (onlyOne) {
            return listings[0];
        } else {
            return listings;
        }
    }

    var listingsSnapshots = await this.getSnapshots(notFoundListingsIds);
    listings = listings.concat(listingsSnapshots);

    if (onlyOne) {
        return listings[0];
    } else {
        return listings;
    }
};

ListingSchema.statics.getSnapshots = async function (listingsIds) {
    var snapshots = await ModelSnapshot
        .find({
            targetType: "listing",
            targetId: listingsIds
        })
        .sort({ createdDate: -1 });

    snapshots = _.map(snapshots, snapshot => {
        return ModelSnapshot.exposeSnapshot(snapshot, true);
    });

    var groupSnapshots = _.groupBy(snapshots, "id");

    return _.reduce(listingsIds, (memo, listingId) => {
        var snapshots = groupSnapshots[listingId];

        // only keep the most recent snapshot
        if (snapshots && snapshots.length) {
            memo.push(snapshots[0]);
        }

        return memo;
    }, []);
};

ListingSchema.statics.getListingTypesProperties = function (listing, listingTypes) {
    return _.reduce(listing.listingTypesIds, (memo, listingTypeId) => {
        const listingType = _.find(listingTypes, l => µ.isSameId(l.id, listingTypeId));
        if (listingType) {
            _.forEach(listingType.properties, (property, key) => {
                memo[key] = memo[key] || {};
                memo[key][property] = true;
            });
        }
        return memo;
    }, {});
}

ListingSchema.statics.getMaxQuantity = function (listing, listingType) {
    const { AVAILABILITY } = listingType.properties;

    let maxQuantity;

    if (AVAILABILITY === 'STOCK') {
        maxQuantity = listing.quantity;
    } else if (AVAILABILITY === 'UNIQUE') {
        maxQuantity = 1;
    } else { // AVAILABILITY === 'NONE'
        maxQuantity = Infinity;
    }

    return maxQuantity;
};

ListingSchema.pre('save', function (next) {
    if (this.isNew) {
        if (this.name) {
            this.nameURLSafe = ToolsService.getURLStringSafe(this.name);
        }
    }
    next();
});

ListingSchema.post('save', function (doc) {
    ElasticsearchService.shouldSyncListings([doc.id]);
});

ListingSchema.post('update', function (doc) {
    ElasticsearchService.shouldSyncListings([doc.id]);
});

ListingSchema.post('updateOne', function (doc) {
    ElasticsearchService.shouldSyncListings([doc.id]);
});

ListingSchema.post('findOneAndUpdate', function (doc) {
    ElasticsearchService.shouldSyncListings([doc.id]);
});

ListingSchema.post('remove', function (doc) {
    ElasticsearchService.shouldSyncListings([doc.id]);
});

ListingSchema.post('findOneAndRemove', function (doc) {
    ElasticsearchService.shouldSyncListings([doc.id]);
});

ListingSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Listing', ListingSchema);
