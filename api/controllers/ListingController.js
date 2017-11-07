/* global
    BookingService, ListingService, ListingTypeService,
    PriceRecommendationService, PricingService, SearchService, StelaceEventService, TokenService, ToolsService
*/

const {
    Bookmark,
    Listing,
    Location,
    Media,
    ModelSnapshot,
    SearchEvent,
    Tag,
    User,
} = require('../models_new');

/**
 * ListingController
 *
 * @description :: Server-side logic for managing listings
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {

    find: find,
    findOne: findOne,
    create: create,
    update: update,
    destroy: destroy,

    query: query,
    my: my,
    updateMedias: updateMedias,
    search: search,
    getLocations: getLocations,
    getPricing: getPricing,
    getRecommendedPrices: getRecommendedPrices,
    getRentingPriceFromSellingPrice: getRentingPriceFromSellingPrice,
    pauseListingToggle: pauseListingToggle

};

const moment    = require('moment');
const NodeCache = require('node-cache');

var landingCache = new NodeCache({ stdTTL: 5 * 60 }); // 5 min

function find(req, res) {
    var landing = req.param("landing");
    var ownerId = req.param("ownerId");
    var access = "others";

    if (! landing && ! ownerId) {
        return res.forbidden();
    }

    var formatDate = "YYYY-MM-DD";
    var landingPastLimit = moment().subtract(60, "d").format(formatDate);
    var landingListings = landingCache.get("candidates");

    return Promise
        .resolve()
        .then(() => {
            if (landing) {
                return landingListings || Listing.find({
                    validated: true,
                    locked: false,
                    updatedDate: {
                        $gte: landingPastLimit
                    }
                });
            } else if (ownerId) {
                return Listing.find({ ownerId: ownerId });
            }
        })
        .then(listings => {
            if (landing && ! landingListings) {
                landingCache.set("candidates", listings);
            }
            if (landing) {
                listings = _(listings)
                    .filter(listing => listing.mediasIds.length)
                    .uniq("ownerId")
                    .sample(12)
                    .value();
            }

            var locationsIds = _.reduce(listings, function (memo, listing) {
                memo = memo.concat(listing.locations);
                return memo;
            }, []);
            locationsIds = _.uniq(locationsIds);

            return [
                listings,
                User.find({ _id: _.pluck(listings, "ownerId") }),
                Location.find({ _id: locationsIds })
            ];
        })
        .spread((listings, owners, locations) => {
            return [
                listings,
                owners,
                locations,
                Listing.getMedias(listings),
                User.getMedia(owners)
            ];
        })
        .spread((listings, owners, locations, listingMedias, ownerMedias) => {
            var indexedOwners = _.indexBy(owners, "id");

            listings = _.map(listings, function (listing) {
                listing            = Listing.expose(listing, access);
                listing.medias     = Media.exposeAll(listingMedias[listing.id], access);
                listing.owner      = User.expose(indexedOwners[listing.ownerId], access);
                listing.ownerMedia = Media.expose(ownerMedias[listing.ownerId], access);
                listing.locations  = _.filter(locations, function (location) {
                    return µ.includesObjectId(listing.locations, location.id);
                });
                listing.locations  = Location.exposeAll(listing.locations, access);

                return listing;
            });

            res.json(listings);
        })
        .catch(res.sendError);
}

async function findOne(req, res) {
    const id = req.param('id');
    const snapshotAllowed = (req.param('snapshot') === 'true');
    let access;

    const formatDate = 'YYYY-MM-DD';
    const today = moment().format(formatDate);

    try {
        let listing;

        if (snapshotAllowed) {
            listing = await Listing.getListingsOrSnapshots(id);
        } else {
            listing = await Listing.findById(id);
        }

        if (!listing) {
            throw new NotFoundError();
        }

        const [
            owner,
            futureBookings,
        ] = await Promise.all([
            User.findById(listing.ownerId),
            ! listing.snapshot ? Listing.getFutureBookings(listing.id, today) : [],
        ]);

        if (!listing.snapshot) {
            await Listing.getTags(listing, true);
        }

        const [
            listingMedias,
            ownerMedia,
            listingInstructionsMedias,
        ] = await Promise.all([
            Listing.getMedias([listing]).then(listingMedias => listingMedias[listing.id]),
            User.getMedia([owner]).then(ownerMedias => ownerMedias[owner.id]),
            Listing.getInstructionsMedias([listing]).then(listingInstructionsMedias => listingInstructionsMedias[listing.id])
        ]);

        if (req.user && µ.isSameId(listing.ownerId, req.user.id)) {
            access = 'self';
        } else {
            access = 'others';
        }

        listing = Listing.expose(listing, access);

        if (! listing.tags) {
            listing.tags         = [];
            listing.completeTags = [];
        }

        listing.owner              = User.expose(owner, access);
        listing.ownerMedia         = Media.expose(ownerMedia, access);
        listing.pricing            = PricingService.getPricing(listing.pricingId);
        listing.medias             = Media.exposeAll(listingMedias, access);
        listing.instructionsMedias = Media.exposeAll(listingInstructionsMedias, access);

        const availableResult = BookingService.getAvailabilityPeriods(futureBookings);
        listing.availablePeriods = availableResult.availablePeriods;

        res.json(listing);
    } catch (err) {
        res.sendError(err);
    }
}

async function create(req, res) {
    var filteredAttrs = [
        "name",
        "reference",
        "description",
        "tags",
        "stateComment",
        "bookingPreferences",
        "accessories",
        "brandId",
        "listingCategoryId",
        "validation",
        "validationFields",
        "locations",
        "listingTypesIds",
        "dayOnePrice",
        "sellingPrice",
        "customPricingConfig",
        "deposit",
        "acceptFree",
    ];
    var createAttrs = _.pick(req.allParams(), filteredAttrs);
    createAttrs.ownerId = req.user.id;
    var access = "self";

    if (! createAttrs.name
        || (createAttrs.tags && ! µ.checkArray(createAttrs.tags, "mongoId"))
        || (createAttrs.locations && ! µ.checkArray(createAttrs.locations, "mongoId"))
        || typeof createAttrs.sellingPrice !== "number" || createAttrs.sellingPrice < 0
        || typeof createAttrs.dayOnePrice !== "number" || createAttrs.dayOnePrice < 0
        || ! PricingService.getPricing(createAttrs.pricingId)
        || typeof createAttrs.deposit !== "number" || createAttrs.deposit < 0
        || (!createAttrs.listingTypesIds || !µ.checkArray(createAttrs.listingTypesIds, 'mongoId') || !createAttrs.listingTypesIds.length)
        || (createAttrs.customPricingConfig && ! PricingService.isValidCustomConfig(createAttrs.customPricingConfig))
    ) {
        return res.badRequest();
    }

    try {
        const validListingTypesIds = await ListingTypeService.isValidListingTypesIds(createAttrs.listingTypesIds);
        if (!validListingTypesIds) {
            return res.badRequest();
        }

        createAttrs.sellingPrice = PricingService.roundPrice(createAttrs.sellingPrice);
        createAttrs.dayOnePrice  = PricingService.roundPrice(createAttrs.dayOnePrice);
        createAttrs.deposit      = PricingService.roundPrice(createAttrs.deposit);

        var pricing = PricingService.getPricing();
        createAttrs.pricingId = pricing.id;

        const [
            myLocations,
            validReferences,
            validTags,
        ] = await Promise.all([
            Location.find({ userId: req.user.id }),
            Listing.isValidReferences({
                brandId: createAttrs.brandId,
                listingCategoryId: createAttrs.listingCategoryId,
            }),
            isValidTags(createAttrs.tags),
        ]);

        if (!validReferences || !validTags) {
            throw new BadRequestError();
        }

        var hashLocations = _.indexBy(myLocations, "id");

        if (createAttrs.locations) {
            if (!isValidLocations(createAttrs.locations, hashLocations)) {
                throw new BadRequestError();
            }
        } else {
            createAttrs.locations = _.pluck(myLocations, "id");
        }

        let listing = await Listing.create(createAttrs);
        if (createAttrs.tags) {
            listing = await Listing.updateTags(listing, createAttrs.tags);
        }

        await StelaceEventService.createEvent({
            req: req,
            res: res,
            label: 'listing.created',
            type: 'core',
            listingId: listing.id,
            data: {
                nbPictures: listing.mediasIds.length,
            },
        });

        res.json(Listing.expose(listing, access));
    } catch (err) {
        res.sendError(err);
    }



    async function isValidTags(tagsIds) {
        if (!tagsIds) return true;

        const tags = await Tag.find({ _id: _.uniq(tagsIds) });
        return tags.length === tagsIds.length;
    }

    function isValidLocations(locationsIds, hashLocations) {
        return _.reduce(locationsIds, (memo, locationId) => {
            if (!hashLocations[locationId]) {
                memo = memo && false;
            }
            return memo;
        }, true);
    }
}

async function update(req, res) {
    var id = req.param("id");
    var filteredAttrs = [
        "name",
        "reference",
        "description",
        "tags",
        "stateComment",
        "bookingPreferences",
        "accessories",
        "brandId",
        "listingCategoryId",
        "locations",
        "listingTypesIds",
        "dayOnePrice",
        "sellingPrice",
        "customPricingConfig",
        "deposit",
        "acceptFree"
    ];
    var updateAttrs = _.pick(req.allParams(), filteredAttrs);
    var access = "self";

    if ((updateAttrs.tags && ! µ.checkArray(updateAttrs.tags, "mongoId"))
        || (updateAttrs.locations && ! µ.checkArray(updateAttrs.locations, "mongoId"))
        || (updateAttrs.sellingPrice && (typeof updateAttrs.sellingPrice !== "number" || updateAttrs.sellingPrice < 0))
        || (updateAttrs.dayOnePrice && (typeof updateAttrs.dayOnePrice !== "number" || updateAttrs.dayOnePrice < 0))
        || (updateAttrs.deposit && (typeof updateAttrs.deposit !== "number" || updateAttrs.deposit < 0))
        || (updateAttrs.customPricingConfig && ! PricingService.isValidCustomConfig(updateAttrs.customPricingConfig))
    ) {
        return res.badRequest();
    }

    if (typeof updateAttrs.dayOnePrice === "number") {
        updateAttrs.dayOnePrice = PricingService.roundPrice(updateAttrs.dayOnePrice);
    }
    if (typeof updateAttrs.deposit === "number") {
        updateAttrs.deposit = PricingService.roundPrice(updateAttrs.deposit);
    }

    try {
        const validListingTypesIds = await ListingTypeService.isValidListingTypesIds(updateAttrs.listingTypesIds);
        if (!validListingTypesIds) {
            return res.badRequest();
        }

        const [
            listing,
            validReferences,
            validLocations,
            validTags,
        ] = await Promise.all([
            Listing.findById(id),
            Listing.isValidReferences({
                brandId: updateAttrs.brandId,
                listingCategoryId: updateAttrs.listingCategoryId
            }),
            isValidLocations(updateAttrs.locations),
            isValidTags(updateAttrs.tags)
        ]);

        if (! listing) {
            throw new NotFoundError();
        }
        if (!µ.isSameId(listing.ownerId, req.user.id)) {
            throw new ForbiddenError();
        }
        if (! validReferences
            || ! validLocations
            || ! validTags
        ) {
            throw new BadRequestError();
        }

        var isListingValidated = (! listing.validation || (listing.validation && listing.validated));
        if (typeof updateAttrs.name !== "undefined" && ! isListingValidated) {
            updateAttrs.nameURLSafe = ToolsService.getURLStringSafe(updateAttrs.name);
        }

        let exposedListing = await Listing.findByIdAndUpdate(listing.id, updateAttrs, { new: true });
        if (updateAttrs.tags) {
            exposedListing = await Listing.updateTags(exposedListing, updateAttrs.tags);
        }

        res.json(Listing.expose(exposedListing, access));
    } catch (err) {
        res.sendError(err);
    }



    async function isValidLocations(locationsIds) {
        if (!locationsIds) return true;

        const locations = await Location.find({
            _id: _.uniq(locationsIds),
            userId: req.user.id,
        });
        return locations.length === locationsIds.length;
    }

    async function isValidTags(tagsIds) {
        if (!tagsIds) return true;

        const tags = await Tag.find({ _id: _.uniq(tagsIds) });
        return tags.length === tagsIds.length;
    }
}

async function destroy(req, res) {
    var id = req.param("id");
    var today = moment().format("YYYY-MM-DD");

    try {
        const listing = await Listing.findOne({
            _id: id,
            ownerId: req.user.id,
        });
        if (!listing) {
            throw new NotFoundError();
        }

        const futureBookings = await Listing.getFutureBookings(listing.id, today);
        if (futureBookings.length) {
            const error = new BadRequestError("remaining bookings");
            error.expose = true;
            throw error;
        }

        await Bookmark.update({ listingId: id }, { active: false }); // disable bookmarks associated to this listing

        // create a snapshot before destroying the listing
        await ModelSnapshot.getSnapshot("listing", listing);

        await sendEvent(req, res, id);
        await listing.remove();

        res.json({ id });
    } catch (err) {
        res.sendError(err);
    }



    function sendEvent(req, res, listingId) {
        return StelaceEventService.createEvent({
            req: req,
            res: res,
            label: "listing.deleted",
            data: { listingId },
            type: 'core',
        });
    }
}

function query(req, res) {
    var query = req.param("q");
    var access = "self";

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }

    return Promise.coroutine(function* () {
        query = query.trim();

        if (! query) {
            return res.json([]);
        }

        var listingId = getListingId(query);
        var listings = [];
        var listing;

        if (listingId) {
            listing = yield Listing.findById(listingId);
            if (listing) {
                listings.push(listing);
            }
        } else {
            if (isEnoughLongToken(query)) {
                listings = yield Listing.find({ name: { $regex: query, $options: 'i' } });
            } else {
                listings = [];
            }
        }

        res.json(Listing.exposeAll(listings, access));
    })()
    .catch(res.sendError);



    function getListingId(str) {
        return µ.isMongoId(str) ? str : null;
    }

    function isEnoughLongToken(token) {
        return token.length >= 3;
    }
}

function my(req, res) {
    var access = "self";

    return Promise
        .resolve()
        .then(() => {
            return Listing.find({ ownerId: req.user.id });
        })
        .then(listings => {
            return [
                listings,
                Listing.getMedias(listings),
                Listing.getInstructionsMedias(listings),
                Listing.getTags(listings)
            ];
        })
        .spread((listings, hashMedias, hashInstructionsMedias) => {
            listings = Listing.exposeAll(listings, access);

            _.forEach(listings, function (listing) {
                var medias             = hashMedias[listing.id];
                var instructionsMedias = hashInstructionsMedias[listing.id];

                listing.medias             = _.map(medias, media => Media.expose(media, access));
                listing.pricing            = PricingService.getPricing(listing.pricingId);
                listing.instructionsMedias = _.map(instructionsMedias, media => Media.expose(media, access));
            });

            res.json(listings);
        })
        .catch(res.sendError);
}

function updateMedias(req, res) {
    var id = req.param("id");
    var mediasIds = req.param("mediasIds");
    var mediaType = req.param("mediaType");

    if (! mediasIds || ! µ.checkArray(mediasIds, "mongoId")) {
        return res.badRequest();
    }
    if (! _.contains(["listing", "instructions"], mediaType)) {
        return res.badRequest();
    }
    if ((mediaType === "listing" && Media.get("maxNb").listing < mediasIds.length)
        || (mediaType === "instructions" && Media.get("maxNb").listingInstructions < mediasIds.length)
    ) {
        return res.badRequest(new BadRequestError("cannot set too much medias"));
    }

    return Promise
        .resolve()
        .then(() => {
            return [
                Listing.findById(id),
                Media.find({ _id: mediasIds })
            ];
        })
        .spread((listing, medias) => {
            var isAllOwnMedias = _.reduce(medias, function (memo, media) {
                if (!µ.isSameId(req.user.id, media.userId)) {
                    memo = memo && false;
                }
                return memo;
            }, true);

            if (! listing
                || medias.length !== mediasIds.length
            ) {
                throw new NotFoundError();
            }
            if (!µ.isSameId(req.user.id, listing.ownerId)
                || ! isAllOwnMedias
            ) {
                throw new ForbiddenError();
            }

            var updateAttrs = {};

            if (mediaType === "listing") {
                updateAttrs.mediasIds = mediasIds;
            } else if (mediaType === "instructions") {
                updateAttrs.instructionsMediasIds = mediasIds;
            }

            return Listing.findByIdAndUpdate(listing.id, updateAttrs, { new: true });
        })
        .then(() => {
            res.ok({ id });
        })
        .catch(res.sendError);
}

async function search(req, res) {
    let searchQuery = req.param('searchQuery');
    const type = req.param('type'); // possible values: "search" or "similar"

    try {
        searchQuery = SearchService.normalizeSearchQuery(searchQuery, type);
    } catch (e) {
        return res.badRequest();
    }

    await (async function () {
        // track the search request
        const logConfig = await SearchService.createEvent({
            searchQuery,
            type,
            req,
            res,
        })
        .catch(() => null);

        const searchStartDate = new Date();

        // retrieve the search query from the cache and use if it exists
        const cacheKey = SearchService.getQueryHash(searchQuery);
        let listings = SearchService.getListingsFromCache(cacheKey);

        // results not in cache, so compute the search
        if (! listings) {
            listings = await SearchService.getListingsFromQuery(searchQuery, type);
            SearchService.setListingsToCache(cacheKey, listings); // set results in cache
        }

        let { page, limit, timestamp } = searchQuery;

        if (SearchService.isWrongPageParams(listings, page, limit)) {
            page = 1;
        }

        // set the search completion duration
        if (logConfig && logConfig.searchEvent) {
            // asynchronous operation
            SearchEvent
                .findByIdAndUpdate(logConfig.searchEvent.id, {
                    completionDuration: new Date() - searchStartDate
                }, { new: true })
                .exec()
                .catch(() => null);
        }

        res.json({
            page,
            limit,
            timestamp, // is used for client-side to prevent old requests racing
            count: listings.length,
            listings: SearchService.getListingsByPagination(listings, page, limit), // return only listings based on pagination params
        });
    })()
    .catch(res.sendError);
}

function getLocations(req, res) {
    var id     = req.param("id");

    var access = "others";

    if (!µ.isMongoId(id)) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Listing.findById(id);
        })
        .then(listing => {
            if (! listing) {
                throw new NotFoundError();
            }

            return Location.find({ _id: listing.locations });
        })
        .then(locations => {
            res.json(Location.exposeAll(locations, access));
        })
        .catch(res.sendError);
}

function getPricing(req, res) {
    var pricingId = parseInt(req.param("pricingId"), 10);
    var pricing = PricingService.getPricing(pricingId);

    if (! pricing) {
        return res.notFound();
    }

    return res.json({
        id: pricing.id,
        config: pricing.config,
        ownerFeesPercent: PricingService.get("ownerFeesPercent"),
        takerFeesPercent: PricingService.get("takerFeesPercent"),
        ownerFeesPurchasePercent: PricingService.get("ownerFeesPurchasePercent"),
        takerFeesPurchasePercent: PricingService.get("takerFeesPurchasePercent"),
        maxDiscountPurchasePercent: PricingService.get("maxDiscountPurchasePercent")
    });
}

function pauseListingToggle(req, res) {
    var listingId = req.param("id");
    var pausedUntil = req.param("pausedUntil");
    var pause = req.param("pause");
    var access = "self";

    return Promise.coroutine(function* () {
        var updatedListing = yield ListingService.pauseListingToggle({
            listingId,
            pause,
            pausedUntil,
            req,
            res,
        });

        res.json(Listing.expose(updatedListing, access));
    })()
    .catch(res.sendError);
}

function getRecommendedPrices(req, res) {
    var query = req.param("query");

    if (typeof query !== "string") {
        throw new BadRequestError("Query string expected");
    }

    return PriceRecommendationService.getRecommendedPrices(query)
        .then(prices => {
            res.json(prices);
        })
        .catch(err => {
            req.logger.info({ err: err }, "Could not recommend a listing price.");
            return res.ok();
        });
}

function getRentingPriceFromSellingPrice(req, res) {
    var sellingPrice = req.param("value");

    if (! _.isFinite(sellingPrice)) {
        throw new BadRequestError("Number expected");
    }

    return PriceRecommendationService.getRentingPriceFromSellingPrice(sellingPrice)
        .then(prices => {
            res.json(prices);
        })
        .catch(res.sendError);
}
