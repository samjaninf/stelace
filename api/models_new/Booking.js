/* global TimeService */

const mongoose = require('mongoose');
const moment = require('moment');

const { extendSchema } = require('./util');
const Conversation = require('./Conversation');

const BookingSchema = mongoose.Schema({
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    listingSnapshotId: mongoose.Schema.Types.ObjectId,
    listingTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    listingType: {
        type: Object,
        required: true,
    },
    paidDate: Date, // taker action, set if paymentDate and depositDate are set
    acceptedDate: Date, // owner action, when accepting the booking
    autoAcceptation: {
        type: Boolean,
        default: false,
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    takerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    quantity: {
        type: Number,
        default: 1
    },
    startDate: Date,
    endDate: Date,
    nbTimeUnits: Number,
    timeUnit: String,
    timeUnitPrice: Number, // float
    currency: String,
    ownerPrice: Number, // float - displayed price set by owner
    takerPrice: Number, // float - after rebate and fees
    ownerFees: Number, // float - set the value in case the formula change
    takerFees: Number, // float - set the value in case the formula change
    priceData: Object,
    options: Object,
    pricingId: Number,
    customPricingConfig: Object,
    deposit: Number, // float
    dates: Object,
    completedDate: Date,
    paymentCompleted: Boolean,

    paymentDate: Date, // taker action, set when preauth payment is done
    depositDate: Date, // taker action, set when preauth deposit is done
    releaseDepositDate: Date, // renew deposit until this date, after the deposit must be cancelled
    paymentUsedDate: Date, // set when preauth payment is used
    paymentTransferDate: Date, // set when the payment can be withdrawn by the owner
    withdrawalDate: Date, // owner action, set when the withdrawal is done

    cancellationId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    cancellationPaymentDate: Date,
    cancellationDepositDate: Date,
    stopRenewDeposit: {
        type: Boolean,
        default: false,
    },
    contractId: String,
});

extendSchema(BookingSchema);

BookingSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "listingId",
            "listingSnapshotId",
            "listingTypeId",
            "listingType",
            "parentId",
            "paidDate",
            "acceptedDate",
            "autoAcceptation",
            "ownerId",
            "takerId",
            "quantity",
            "startDate",
            "endDate",
            "nbTimeUnits",
            "timeUnit",
            "timeUnitPrice",
            "ownerPrice",
            "priceData",
            "takerPrice",
            "deposit",
            "ownerFees",
            "takerFees",
            "paymentDate",
            "depositDate",
            "cancellationId"
        ],
        owner: [
            "id",
            "listingId",
            "listingSnapshotId",
            "listingTypeId",
            "listingType",
            "parentId",
            "paidDate",
            "acceptedDate",
            "autoAcceptation",
            "ownerId",
            "takerId",
            "quantity",
            "startDate",
            "endDate",
            "nbTimeUnits",
            "timeUnit",
            "timeUnitPrice",
            "ownerPrice",
            "priceData",
            "takerPrice",
            "deposit",
            "ownerFees",
            "takerFees",
            "paymentDate",
            "depositDate",
            "paymentTransferDate",
            "withdrawalDate",
            "cancellationId"
        ],
        others: [
            "id",
            "listingId",
            "listingTypeId",
            "listingType",
            "parentId",
            "ownerId",
            "takerId",
            "startDate",
            "endDate",
            "quantity",
            "nbTimeUnits",
            "timeUnit",
            "cancellationId"
        ]
    };

    return accessFields[access];
};

/**
 * Check if booking dates are valid when calendar needed based on listing type config
 * @param  {String}  startDate
 * @param  {Number}  nbTimeUnits
 * @param  {String}  refDate
 * @param  {Object}  config
 * @return {Boolean}
 */
BookingSchema.statics.isValidDates = function ({
    startDate,
    nbTimeUnits,
    refDate,
    config,
}) {
    const errors          = {};
    const badParamsErrors = {};

    if (!TimeService.isDateString(startDate)) {
        badParamsErrors.BAD_FORMAT_START_DATE = true;
    }
    if (!TimeService.isDateString(refDate)) {
        badParamsErrors.MISSING_REF_DATE = true;
    }
    if (! _.isEmpty(badParamsErrors)) {
        errors.BAD_PARAMS = badParamsErrors;
        return exposeResult(errors);
    }

    let startDateMinLimit;
    let startDateMaxLimit;

    if (config.startDateMinDelta) {
        startDateMinLimit = moment(refDate).add(config.startDateMinDelta).toISOString();
    }
    if (config.startDateMaxDelta) {
        startDateMaxLimit = moment(refDate).add(config.startDateMaxDelta).toISOString();
    }

    let durationErrors  = {};
    let startDateErrors = {};

    if (nbTimeUnits <= 0) {
        durationErrors.INVALID = true;
    } else {
        if (nbTimeUnits && config.minDuration && nbTimeUnits < config.minDuration) {
            durationErrors.BELOW_MIN = true;
        }
        if (nbTimeUnits && config.maxDuration && config.maxDuration < nbTimeUnits) {
            durationErrors.ABOVE_MAX = true;
        }
    }
    if (startDateMinLimit && startDate < startDateMinLimit) {
        startDateErrors.BEFORE_MIN = true;
    }
    if (startDateMaxLimit && startDateMaxLimit < startDate) {
        startDateErrors.AFTER_MAX = true;
    }

    if (! _.isEmpty(durationErrors)) {
        errors.DURATION = durationErrors;
    }
    if (! _.isEmpty(startDateErrors)) {
        errors.START_DATE = startDateErrors;
    }

    return exposeResult(errors);



    function exposeResult(errors) {
        return {
            result: ! _.keys(errors).length,
            errors: errors
        };
    }
};

BookingSchema.statics.computeEndDate = function ({ startDate, nbTimeUnits, timeUnit }) {
    const duration = { [timeUnit]: nbTimeUnits };
    return moment(startDate).add(duration).toISOString();
};

BookingSchema.statics.getAgreementUserId = function (booking) {
    return booking.ownerId;
};

BookingSchema.statics.isValidationTooLate = function (booking, refDate) {
    // booking can't be accepted if paid and "7 days - 1 hour" after the paid date
    return booking.paidDate && moment(refDate).diff(booking.paidDate, "h") > 167;
};

BookingSchema.statics.isNoTime = function (booking) {
    return booking.listingType.properties.TIME === 'NONE';
};

BookingSchema.statics.getLaunchDate = function (booking) {
    if (booking.paidDate < booking.acceptedDate) {
        return booking.acceptedDate;
    } else {
        return booking.paidDate;
    }
};

/**
 * get due date
 * @param  {object} booking
 * @param  {string} type - one value of ["start", "end"]
 * @return {string} due date
 */
BookingSchema.statics.getDueDate = function (booking, type) {
    var dueDate;

    if (! _.includes(["start", "end"], type)) {
        throw new Error("Bad type");
    }

    if (this.isNoTime(booking)) {
        dueDate = this.getLaunchDate(booking);
        dueDate = moment(dueDate).add(2, "d").format("YYYY-MM-DD");
    } else {
        if (type === "start") {
            dueDate = booking.startDate.format("YYYY-MM-DD");
        } else { // type === "end"
            dueDate = booking.endDate.format("YYYY-MM-DD");
        }
    }

    return dueDate;
};

BookingSchema.statics.updateBookingEndState = async function (booking, now) {
    // if already done
    if (booking.releaseDepositDate) {
        return booking;
    }

    const releaseDuration = booking.listingType.config.bookingTime.releaseDateAfterEndDate;

    // the deposit expires N days after the return date of the booking
    booking.releaseDepositDate = moment(now).add(releaseDuration).toISOString();
    return await booking.save();
};

BookingSchema.statics.canListingQuantityEvolve = function (booking) {
    const { TIME, AVAILABILITY } = booking.listingType.properties;
    // listing quantity change if there is no time but there is a stock
    return TIME === 'NONE' && AVAILABILITY !== 'NONE';
};

/**
 * After some booking operations, listing quantity can evolve
 * like decrease stock after payment
 * or increase stock after booking rejection
 * @param {Object} booking
 * @param {String} actionType - possible values: ['add', 'remove']
 */
BookingSchema.statics.updateListingQuantity = async function (booking, { actionType }) {
    const Listing = require('./Listing');

    if (!_.includes(['add', 'remove'], actionType)) {
        throw new Error('Incorrect action type');
    }

    if (!this.canListingQuantityEvolve(booking)) return;

    const listing = await Listing.findById(booking.listingId);
    if (!listing) {
        throw new NotFoundError();
    }

    const updateAttrs = {};
    if (actionType === 'add') {
        updateAttrs.quantity = listing.quantity + booking.quantity;
    } else if (actionType === 'remove') {
        updateAttrs.quantity = Math.max(listing.quantity - booking.quantity, 0);
    }

    await Listing.findByIdAndUpdate(booking.listingId, updateAttrs, { new: true });
};

BookingSchema.statics.getLast = async function (listingIdOrIds) {
    var onlyOne;
    var listingIds;

    if (_.isArray(listingIdOrIds)) {
        listingIds = _.uniq(listingIdOrIds);
        onlyOne = false;
    } else {
        listingIds = listingIdOrIds;
        onlyOne = true;
    }

    var findAttrs = {
        listingId: listingIds,
        cancellationId: null,
        paidDate: { $ne: null },
        acceptedDate: { $ne: null }
    };

    if (onlyOne) {
        return await this.findOne(findAttrs).sort({ startDate: -1 });
    } else {
        var bookings = await this.find(findAttrs).sort({ startDate: -1 });

        var hashListings = _.reduce(listingIds, function (memo, listingId) {
            memo[listingId] = null;
            return memo;
        }, {});

        _.forEach(bookings, function (booking) {
            if (! hashListings[booking.listingId]) {
                hashListings[booking.listingId] = booking;
            }
        });

        return hashListings;
    }
};

BookingSchema.statics.isComplete = function (booking, inputAssessment, outputAssessment) {
    var result;

    result = booking.acceptedDate
        && booking.paidDate
        && ! booking.cancellationId
        && inputAssessment && inputAssessment.signedDate;

    // renting booking: input and output assessments signed
    // purchase booking: only input assessment signed
    if (! this.isNoTime(booking)) {
        result = result && (outputAssessment && outputAssessment.signedDate);
    }

    return !! result;
};

/**
 * Get visible assessments associated with bookings
 * @param  {Object} bookings
 * @return {Object} hashBookings
 * @return {Object} [hashBookings[bookingId].inputAssessment] - can be null
 * @return {Object} [hashBookings[bookingId].outputAssessment] - can be null
 */
BookingSchema.statics.getAssessments = async function (bookings) {
    const Assessment = require('./Assessment'); // TODO: remove this circular dependency

    const bookingsIds = _.pluck(bookings, 'id');

    let assessments = await Assessment.find({
        $or: [
            { startBookingId: bookingsIds },
            { endBookingId: bookingsIds },
        ],
    });

    const resultAssessments = await Assessment.filterConversationAssessments(assessments);
    assessments = resultAssessments.assessments;

    const indexedStart = _.indexBy(assessments, "startBookingId");
    const indexedEnd   = _.indexBy(assessments, "endBookingId");

    return _.reduce(bookings, (memo, booking) => {
        const inputAssessment = indexedStart[booking.id];
        const outputAssessment = indexedEnd[booking.id];

        memo[booking.id] = {
            inputAssessment: inputAssessment || null,
            outputAssessment: outputAssessment || null,
        };

        return memo;
    }, {});
};

BookingSchema.statics.getBookingRef = function (bookingId) {
    return `BKG_${bookingId}`;
};

/**
 * Get bookings that are not paid or not validated
 * @param  {number}  listingId
 * @param  {object}  [args]
 * @param  {object}  [args.refBooking] - if provided, get pending bookings except this one
 * @param  {boolean} [args.intersection = false] - if true (refBooking needed), get only bookings that overlap the refBooking period
 * @return {object[]} bookings
 */
BookingSchema.statics.getPendingBookings = async function (listingId, args) {
    var refBooking   = args.refBooking;
    var intersection = args.intersection || false;

    var findAttrs = {
        listingId: listingId
    };

    if (refBooking) {
        _.assign(findAttrs, {
            _id: { $ne: refBooking.id }
        });

        // there is no period for a no-time booking
        if (intersection && ! this.isNoTime(refBooking)) {
            _.assign(findAttrs, {
                startDate: { $lte: refBooking.endDate },
                endDate: { $gte: refBooking.startDate },
            });
        }
    }

    _.assign(findAttrs, {
        $or: [
            { paidDate: null },
            { acceptedDate: null }
        ],
        cancellationId: null
    });

    return await this.find(findAttrs);
};

/**
 * filter visible bookings
 * visible bookings means:
 * - bookings that are in a conversation
 * - bookings that users can interact with (there can be multiples bookings in same conversation
 *     but only the most recent one is displayed)
 *
 * @param  {object[]} bookings
 *
 * @return {object}   res
 * @return {object[]} res.bookings
 * @return {object}   res.hashBookings
 * @return {object}   res.hashBookings[bookingId] - conversation
 */
BookingSchema.statics.filterVisibleBookings = async function (bookings) {
    var bookingsIds = _.pluck(bookings, "id");

    var conversations = await Conversation.find({ bookingId: bookingsIds });

    var indexedConversations = _.indexBy(conversations, "bookingId");

    return _.reduce(bookings, (memo, booking) => {
        var conversation = indexedConversations[booking.id];
        if (conversation) {
            memo.bookings.push(booking);
            memo.hashBookings[booking.id] = conversation;
        }
        return memo;
    }, {
        bookings: [],
        hashBookings: {}
    });
};

BookingSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Booking', BookingSchema);
