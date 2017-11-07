/* global LoggerService, TimeService */

const mongoose = require('mongoose');
const moment = require('moment');
const LRU = require("lru-cache")

const { extendSchema } = require('./util');
const Booking = require('./Booking');
const Listing = require('./Listing');
const User = require('./User');

const creatingRatingCache = LRU({
    max: 1000,
    maxAge: 1000 * 10,
});

const RatingSchema = mongoose.Schema({
    score: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    comment: {
        type: String,
        maxLength: 2000,
    },
    listingComment: {
        type: String,
        maxLength: 2000,
    },
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    userType: String,
    targetId: mongoose.Schema.Types.ObjectId,
    targetType: {
        type: String,
        enum: ['owner', 'taker'],
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    visibleDate: Date, // if now is after "visibleDate", then the rating can be visible
});

extendSchema(RatingSchema);

const params = {
    scores: [1, 2, 3, 4, 5],
    types: ['owner', 'taker'],
    nbDaysAfterBookingEndDateToCreate: 60,
    nbDaysToUpdateAfterBothCompletion: 1,
};

RatingSchema.statics.getAccessFields = function (access) {
    const accessFields = {
        self: [ // req.user.id in (userId || targetId)
            'id',
            'score',
            'comment',
            'listingComment',
            'listingId',
            'userId',
            'userType',
            'targetId',
            'targetType',
            'bookingId',
            'visibleDate',
            'createdDate',
            'updatedDate',
        ],
        others: [
            'id',
            'score',
            'comment',
            'listingComment',
            'listingId',
            'userId',
            'userType',
            'targetId',
            'targetType',
            'visibleDate',
            'createdDate',
            'updatedDate',
        ],
    };

    return accessFields[access];
};

RatingSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

/**
 * propagate rating change
 * @param  {object}  rating
 * @param  {number}  [scoreDiff = 0]
 * @param  {boolean} [isNewRating = false]
 * @return {Promise<void>}
 */
RatingSchema.statics.propagateRatingChange = async function (rating, scoreDiff = 0, isNewRating = false) {
    // nothing to propagate if not a new rating and no score diff
    if (! isNewRating && scoreDiff === 0) {
        return;
    }

    const updateAttrs = {
        $inc: { score: scoreDiff },
    };
    if (isNewRating) {
        updateAttrs.$inc.ratingScore = 1;
    }

    // Scores are saved in models for simplicity and less requests but this implies some corruption risks.
    // Acceptable for search results or other agregated info. Ratings are requested anyway for detailed info.
    // Use UpdateUserAndListingRatings script to check periodically
    await Promise.all([
        User.update({ _id: rating.targetUserId }, updateAttrs),
        rating.targetType === 'owner' ? Listing.update({ _id: rating.listingId }, updateAttrs) : null,
    ]);
};

/**
 * Classify the ratings associated with a booking by:
 * - 'my' if the rating if from the current user
 * - 'other' otherwise
 * @param  {Object[]} ratings
 * @param  {ObjectId} userId - the current user
 * @return {Object} classifiedRatings
 * @return {Object} classifiedRatings.my
 * @return {Object} classifiedRatings.other
 */
RatingSchema.statics.classify = function (ratings, userId) {
    return _.reduce(ratings, (classifiedRatings, rating) => {
        if (µ.isSameId(rating.userId, userId)) {
            classifiedRatings.my = rating;
        } else {
            classifiedRatings.other = rating;
        }

        return classifiedRatings;
    }, {});
};

RatingSchema.statics.getRoles = function (booking, userId) {
    var roles = {
        userId: userId,
        userType: null,
        targetId: null,
        targetType: null
    };

    if (µ.isSameId(userId, booking.takerId)) {
        roles.userType   = 'taker';
        roles.targetId   = booking.ownerId;
        roles.targetType = 'owner';
    } else { // µ.isSameId(userId, booking.ownerId)
        roles.userType   = 'owner';
        roles.targetId   = booking.takerId;
        roles.targetType = 'taker';
    }

    return roles;
};

RatingSchema.statics.getDefaultVisibleDate = function (booking) {
    var nbDays = this.get("nbDaysAfterBookingEndDateToCreate");
    var date;

    if (! Booking.isNoTime(booking)) {
        date = booking.endDate;
    } else {
        date = Booking.getDueDate(booking, "end");
    }

    return moment(date).add(nbDays, "d").toISOString();
};

RatingSchema.statics.isCompleteRating = function (rating) {
    return rating.score && (rating.comment || rating.listingComment);
};

// the comments of ratings are hidden if visible date isn't passed
RatingSchema.statics.hideCommentsWhenNotVisible = function (ratings, now) {
    return _.map(ratings, rating => {
        if (rating.visibleDate > new Date(now)) {
            rating.comment     = null;
            rating.listingComment = null;
        }

        return rating;
    });
};

RatingSchema.statics.exposeClassifiedRatings = function (classifiedRatings, now) {
    classifiedRatings = _.clone(classifiedRatings);

    // the rating from the other person is hidden unless the visible date is passed
    // when hidden, get the level of completeness
    if (classifiedRatings.other) {
        // after visibleDate, ratings are shown
        if (classifiedRatings.other.visibleDate < new Date(now)) {
            classifiedRatings.other = this.expose(classifiedRatings.other, "others");
        } else {
            if (this.isCompleteRating(classifiedRatings.other)) {
                classifiedRatings.other = "complete";
            } else {
                // set to null, prove rating existence but don't reveal it
                classifiedRatings.other = null;
            }
        }
    }

    if (classifiedRatings.my) {
        classifiedRatings.my = this.expose(classifiedRatings.my, "self");
    }

    return classifiedRatings;
};

// if the ratings from the two parts are complete,
RatingSchema.statics.updateRatingsVisibleDate = async function (classifiedRatings, visibleDate) {
    visibleDate = visibleDate || moment().add(this.get("nbDaysToUpdateAfterBothCompletion"), "d").toISOString();

    // if there aren't 2 complete ratings
    if (! classifiedRatings.my
    || ! classifiedRatings.other
    || ! this.isCompleteRating(classifiedRatings.my)
    || ! this.isCompleteRating(classifiedRatings.other)
    ) {
        return classifiedRatings;
    }
    // if the two ratings cannot update their visible date, do nothing
    if (! this.canUpdateVisibleDate(classifiedRatings.my)
    && ! this.canUpdateVisibleDate(classifiedRatings.other)
    ) {
        return classifiedRatings;
    }

    var ratingsIds = [classifiedRatings.my.id, classifiedRatings.other.id];
    var updatedRatings = await this.update({ _id: ratingsIds }, { visibleDate: visibleDate });

    var myRating    = _.find(updatedRatings, rating => µ.isSameId(rating.id, classifiedRatings.my.id));
    var otherRating = _.find(updatedRatings, rating => µ.isSameId(rating.id, classifiedRatings.other.id));

    if (myRating) {
        classifiedRatings.my = myRating;
    }
    if (otherRating) {
        classifiedRatings.other = myRating;
    }

    return classifiedRatings;
};

// visible date can be updated if it isn't "really" set
RatingSchema.statics.canUpdateVisibleDate = function (rating) {
    // if the visible date is "pure" (0 hours, 0 minutes, 0 seconds)
    // then it is almost sure that it was automatically set at creation
    // so that it isn't set because the ratings from the two parts are complete
    return ! rating.visibleDate || TimeService.isPureDate(rating.visibleDate);
};

RatingSchema.statics.getRatersIds = function (booking) {
    return [booking.ownerId, booking.takerId];
};

RatingSchema.pre('save', function (next) {
    // use cache because there is no way to determine if this.isNew in .post('save')
    creatingRatingCache.set(this._id, {
        isNew: this.isNew,
        oldScore: this.isNew ? 0 : this.score,
    });

    next();
});

RatingSchema.post('save', async function (doc) {
    const logger = LoggerService.getLogger("app");

    try {
        const cacheResult = creatingRatingCache.get(doc._id);
        if (!cacheResult) return;

        const scoreDiff = doc.score - cacheResult.oldScore;
        if (!scoreDiff) return;

        await RatingSchema.statics.propagateRatingChange(doc, scoreDiff, cacheResult.isNew);

        creatingRatingCache.del(doc._id);
    } catch (err) {
        logger.error({ err: err }, "update target user and listing nbRatings after rating creation");
    }
});

RatingSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Rating', RatingSchema);
