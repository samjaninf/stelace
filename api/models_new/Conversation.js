const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const ConversationSchema = mongoose.Schema({
    newContentDate: Date, // only updated if new content if conversation (not for read status changes)
    listingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    inputAssessmentId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    outputAssessmentId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
    },
    receiverId: { // owner in general
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    startDate: Date,
    endDate: Date,
    bookingStatus: String,
    agreementStatus: String,
    senderRead: {
        type: Boolean,
        default: true, // first message is always read by sender. Do not forget to update this
    },
    receiverRead: {
        type: Boolean,
        default: false,
    },
    privateContent: String, // last message privateContent
    answerDelay: Number,
});

extendSchema(ConversationSchema);

// Replicate this from message on each update (needs history with messages)
var params = {
    // pre-booking : info with startDate and endDate
    bookingStatus: [
        "info",
        "pre-booking",
        "booking",
        "recall"
    ],
    agreementStatus: [
        // "automatic",
        "agreed",
        "rejected",
        "rejected-by-other",
        "pending",
        "pending-giver",
        "cancelled",
        "recall"
    ]
};

ConversationSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "listingId",
            "bookingId",
            "inputAssessmentId",
            "outputAssessmentId",
            "senderId",
            "receiverId",
            "startDate",
            "endDate",
            "bookingStatus",
            "agreementStatus",
            "receiverRead",
            "senderRead",
            "privateContent",
            "answerDelay",
            "createdDate",
            "updatedDate",
            "newContentDate"
        ],
        others: [
            "id",
            "listingId",
            "bookingId",
            "senderId",
            "receiverId",
            "answerDelay",
            "createdDate",
            "updatedDate",
            "newContentDate"
        ]
    };

    return accessFields[access];
};

ConversationSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

ConversationSchema.statics.isEmpty = function (conversation) {
    // Testing for answerDelay ensures that conversations with no private content but with several messages
    // are not considered empty (if only public question AND answer)
    // New conversations' (no answer yet) empty privateContent case is dealt in MessageController
    return conversation.privateContent === null && conversation.answerDelay === null;
};

ConversationSchema.statics.isPartOfConversation = function (conversation, userId) {
    return µ.includesObjectId([conversation.senderId, conversation.receiverId], userId);
};

ConversationSchema.pre('save', function (next) {
    if (this.isNew) {
        this.newContentDate = this.createdDate;
    }
    next();
});

ConversationSchema.pre('update', function (next) {
    const updateQuery = this.getUpdate();

    const updateContentDate = shouldUpdateNewContentDate(updateQuery.$set);
    if (updateContentDate) {
        this.update({}, { newContentDate: new Date() });
    }
    next();
});

ConversationSchema.pre('updateOne', function (next) {
    const updateQuery = this.getUpdate();

    const updateContentDate = shouldUpdateNewContentDate(updateQuery.$set);
    if (updateContentDate) {
        this.update({}, { newContentDate: new Date() });
    }
    next();
});

ConversationSchema.pre('findOneAndUpdate', function (next) {
    const updateQuery = this.getUpdate();

    const updateContentDate = shouldUpdateNewContentDate(updateQuery);
    if (updateContentDate) {
        this.findOneAndUpdate({}, { newContentDate: new Date() });
    }
    next();
});

function shouldUpdateNewContentDate(objQuery) {
    if (objQuery.startDate
     || objQuery.bookingStatus
     || objQuery.agreementStatus
     || objQuery.privateContent // if bookingStatus is not 'info', any new message must have a private content
     || objQuery.newContentDate // timestamp produced in current function but this can ensure a manual update w/o new message
    ) {
        return true;
    }

    return false;
}

ConversationSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Conversation', ConversationSchema);
