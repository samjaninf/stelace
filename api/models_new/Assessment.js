/* global GeneratorService, ListingHistoryService */

const mongoose = require('mongoose');

const { extendSchema } = require('./util');
const Conversation = require('./Conversation');
const Listing = require('./Listing');
const Location = require('./Location');
const ModelSnapshot = require('./ModelSnapshot');
const User = require('./User');

const AssessmentSchema = mongoose.Schema({
    workingLevel: String, // not required because we want to generate an empty assessment
    cleanlinessLevel: String, // not required because we want to generate an empty assessment
    comment: String,
    commentDiff: String,
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    listingSnapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    startBookingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    endBookingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    ownerSnapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    ownerMainLocationSnapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    takerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    takerSnapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    takerMainLocationSnapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    signToken: String,
    signedDate: Date,
    cancellationId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
});

extendSchema(AssessmentSchema);

const params = {
    workingLevels: ["good", "average", "bad"],
    cleanlinessLevels: ["good", "average", "bad"]
};

AssessmentSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [ // req.user.id in (ownerId || takerId)
            "id",
            "workingLevel",
            "cleanlinessLevel",
            "comment",
            "commentDiff",
            "listingId",
            "listingSnapshotId",
            "startBookingId",
            "endBookingId",
            "ownerId",
            "ownerSnapshotId",
            "takerId",
            "takerSnapshotId",
            "signedDate",
            "cancellationId"
        ],
        others: [
            "id",
            "workingLevel",
            "cleanlinessLevel",
            "comment",
            "commentDiff",
            "listingId",
            "listingSnapshotId",
            "signedDate",
            "cancellationId"
        ]
    };

    return accessFields[access];
};

const beforeAssessmentFields = [
    "workingLevel",
    "cleanlinessLevel",
    "comment",
    "commentDiff"
];

AssessmentSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

AssessmentSchema.statics.isAccessSelf = function (assessment, user) {
    return µ.includesObjectId([assessment.ownerId, assessment.takerId], user.id);
};

AssessmentSchema.statics.getLastSigned = async function (listingIdOrIds) {
    var onlyOne;
    var listingsIds;

    if (_.isArray(listingIdOrIds)) {
        listingsIds = _.uniq(listingIdOrIds);
        onlyOne = false;
    } else {
        listingsIds = [listingIdOrIds];
        onlyOne = true;
    }

    const listingHistories = await ListingHistoryService.getListingHistories(listingsIds);

    if (onlyOne) {
        return listingHistories[listingIdOrIds].getLastSignedAssessment();
    } else {
        return _.reduce(listingHistories, (memo, listingHistory, listingId) => {
            memo[listingId] = listingHistory.getLastSignedAssessment();
            return memo;
        }, {});
    }
};

/**
 * get booking state
 * @param  {object} booking
 * @param  {string} type - must be "start" or "end"
 * @return {object} bookingState
 * @return {ObjectId} bookingState.startBookingId
 * @return {ObjectId} bookingState.endBookingId
 */
AssessmentSchema.statics.getBookingState = function (booking, type) {
    var bookingState = {
        startBookingId: null,
        endBookingId: null
    };

    if (type === "start") {
        bookingState.startBookingId = booking.id;
    } else { // type === "end"
        bookingState.endBookingId = booking.id;
    }

    return bookingState;
};

AssessmentSchema.statics.getRealTakerId = function (assessment) {
    if (assessment.startBookingId) {
        return assessment.takerId;
    } else { // assessment.endBookingId
        return assessment.ownerId;
    }
};

AssessmentSchema.statics.getRealGiverId = function (assessment) {
    if (assessment.startBookingId) {
        return assessment.ownerId;
    } else { // assessment.endBookingId
        return assessment.takerId;
    }
};

AssessmentSchema.statics.getSnapshots = async function (assessment) {
    var usersIds = [assessment.ownerId, assessment.takerId];

    usersIds = _.uniq(usersIds);

    var results;

    results = await Promise.props({
        listing: Listing.findById(assessment.listingId),
        users: User.find({ _id: usersIds }),
    });

    var listing  = results.listing;
    var users = results.users;

    var owner = _.find(users, user => µ.isSameId(user.id, assessment.ownerId));
    var taker = _.find(users, user => µ.isSameId(user.id, assessment.takerId));

    if (! listing
        || ! owner
        || ! taker
    ) {
        throw new NotFoundError();
    }

    results = await Promise.props({
        listingSnapshot: ModelSnapshot.getSnapshot("listing", listing),
        ownerSnapshot: ModelSnapshot.getSnapshot("user", owner),
        takerSnapshot: ModelSnapshot.getSnapshot("user", taker),
        ownerLocSnapshot: Location.getMainLocationSnapshot(owner.id),
        takerLocSnapshot: Location.getMainLocationSnapshot(taker.id),
    });

    return {
        listingSnapshot: results.listingSnapshot,
        ownerSnapshot: results.ownerSnapshot,
        takerSnapshot: results.takerSnapshot,
        ownerMainLocationSnapshot: results.ownerLocSnapshot,
        takerMainLocationSnapshot: results.takerLocSnapshot,
    };
};

AssessmentSchema.statics.getSnapshotsIds = function (snapshots) {
    return {
        listingSnapshotId: snapshots.listingSnapshot.id,
        ownerSnapshotId: snapshots.ownerSnapshot.id,
        takerSnapshotId: snapshots.takerSnapshot.id,
        ownerMainLocationSnapshotId: snapshots.ownerMainLocationSnapshot ? snapshots.ownerMainLocationSnapshot.id : null,
        takerMainLocationSnapshotId: snapshots.takerMainLocationSnapshot ? snapshots.takerMainLocationSnapshot.id : null
    };
};

AssessmentSchema.statics.getPrefilledStateFields = function (assessment) {
    var comment = null;

    if (assessment.comment) {
        comment = assessment.comment;
    }
    if (assessment.commentDiff) {
        comment = (comment || "") + "\n\n" + assessment.commentDiff;
    }

    return {
        workingLevel: assessment.workingLevel,
        cleanlinessLevel: assessment.cleanlinessLevel,
        comment: comment
    };
};

AssessmentSchema.statics.getAssessmentLevel = function (type, level) {
    var levelTypes = {
        working: {
            good: "Fonctionnel",
            average: "Moyen",
            bad: "Non fonctionnel"
        },
        cleanliness: {
            good: "Propre",
            average: "Moyen",
            bad: "Sale"
        }
    };

    var levelType = levelTypes[type];
    if (levelType) {
        return levelType[level];
    }

    return "";
};

/**
 * Make sure the returned assessments are visible through conversations
 * @param  {Object[]} assessments
 * @return {Object} res
 * @return {Object[]} res.assessments - visible assessments
 * @return {Object} res.hashAssessments - hash indexed by assessmentId
 * @return {Object} res.hashAssessments[assessmentId].conversation - assessment conversation
 * @return {Boolean} res.hashAssessments[assessmentId].isInput - is conversation input assessment
 * @return {Boolean} res.hashAssessments[assessmentId].isOutput - is conversation output assessment
 */
AssessmentSchema.statics.filterConversationAssessments = async function (assessments) {
    const assessmentsIds = _.pluck(assessments, 'id');

    const conversations = await Conversation.find({
        $or: [
            { inputAssessmentId: assessmentsIds },
            { outputAssessmentId: assessmentsIds },
        ],
    });

    const indexedInput  = _.indexBy(conversations, 'inputAssessmentId');
    const indexedOutput = _.indexBy(conversations, 'outputAssessmentId');

    const result = {
        assessments: [],
        hashAssessments: {},
    };

    _.forEach(assessments, assessment => {
        const conversation = indexedInput[assessment.id] || indexedOutput[assessment.id];
        if (conversation) {
            result.assessments.push(assessment);
            result.hashAssessments[assessment.id] = {
                conversation,
                isInput: !!indexedInput[assessment.id],
                isOutput: !!indexedOutput[assessment.id],
            };
        }
    });

    return result;
};

AssessmentSchema.statics.exposeBeforeAssessment = function (assessment) {
    return assessment ? _.pick(assessment, beforeAssessmentFields) : null;
};

// conversation may need before assessments to have the previous state of object as placeholder
AssessmentSchema.statics.needBeforeAssessments = function (conversation, inputAssessment, outputAssessment) {
    var input  = !! conversation.inputAssessmentId;
    var output = !! conversation.outputAssessmentId;

    var result = {
        input: false,
        output: false
    };

    // ! input && ! output -> no assessment means no placeholder
    // input && output -> the input assessment is the before output assessment

    // need the before input assessment if the input assessment is not signed
    if (input && ! output) {
        result.input = ! inputAssessment.signedDate;
    // need the before output assessment if the output assessment is not signed
    } else if (! input && output) {
        result.output = ! outputAssessment.signedDate;
    }

    return result;
};

AssessmentSchema.pre('save', function (next) {
    if (this.isNew) {
        if (!this.signToken) {
            this.signToken = GeneratorService.getFunnyString();
        }
    }
    next();
});

AssessmentSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Assessment', AssessmentSchema);
