/* global ToolsService */

const {
    Assessment,
    Booking,
    Cancellation,
    Conversation,
    Listing,
    Location,
    Message,
    User,
} = require('../models_new');

/**
 * MessageController
 *
 * @description :: Server-side logic for managing messages and conversations (made up of messages). Both Messages and Conversations have dedicated Models.
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 *
 * TODO : subscribe to new messages : http://irlnathan.github.io/sailscasts/blog/2013/10/16/building-a-sails-application-ep23-adding-real-time-flash-messages-using-real-time-model-events/
 */

module.exports = {

    create: create,

    conversation: conversation,
    conversationMeta: conversationMeta,
    getConversations: getConversations,
    getPublicMessages: getPublicMessages,
    markAsRead: markAsRead,
    updateMeta: updateMeta
};

var moment = require('moment');

function create(req, res) {
    var filteredAttrs = [
        "conversationId",
        "listingId",
        "senderId",
        "receiverId",
        "startDate",
        "endDate",
        "bookingId",
        "bookingStatus",
        "agreementStatus",
        "privateContent",
        "publicContent"
    ];
    var createAttrs = _.pick(req.allParams(), filteredAttrs);
    var access      = "self";

    if (! req.user) {
        return res.badRequest();
    }

    return Message.createMessage(req.user.id, createAttrs, { logger: req.logger })
        .then((message) => res.json(Message.expose(message, access)))
        .catch(res.sendError);
}

function conversation(req, res) {
    var conversationId = req.param("conversationId");
    var access = "others";

    if (! conversationId) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Message
                .find({ conversationId: conversationId })
                .sort({ createdDate: 1 });
        })
        .then(messages => {
            if (! messages.length) {
                throw new NotFoundError();
            }

            var isSelf = _.find(messages, function (message) {
                return µ.isSameId(req.user.id, message.senderId) || µ.isSameId(req.user.id, message.receiverId);
            });

            if (isSelf) {
                access = "self";
            }

            return _populateBookings(messages, access);
        })
        .then(messages => res.json(messages))
        .catch(res.sendError);
}

// get conversation details in conversationMeta rather than in conversation function itself (the latter populates each message separately)
function conversationMeta(req, res) {
    var conversationId = req.param("conversationId");
    var access         = "others";
    var isSender;
    var isReceiver;

    if (! conversationId) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Conversation.findById(conversationId);
        })
        .then(conversation => {
            if (! conversation) {
                throw new NotFoundError();
            }

            isSender   = req.user && µ.isSameId(req.user.id, conversation.senderId);
            isReceiver = req.user && µ.isSameId(req.user.id, conversation.receiverId);

            if (isSender || isReceiver) {
                access = "self";
            }

            return [
                conversation,
                conversation.senderId ? User.findById(conversation.senderId) : null,
                conversation.receiverId ? User.findById(conversation.receiverId) : null,
                conversation.receiverId ? Location.find({ userId: conversation.receiverId }) : null,
                conversation.bookingId ? Booking.findById(conversation.bookingId) : null
            ];
        })
        .spread((conversation, sender, receiver, receiverLocations, booking) => {
            if ((conversation.senderId && ! sender)
             || (conversation.receiverId && ! receiver)
             || (conversation.receiverId && ! receiverLocations)
             || (conversation.bookingId && ! booking)
            ) {
                throw new NotFoundError();
            }

            return [
                conversation,
                sender,
                receiver,
                receiverLocations,
                booking,
                sender ? User.getMedia([sender]).then(senderMedias => senderMedias[sender.id]) : null,
                receiver ? User.getMedia([receiver]).then(receiverMedias => receiverMedias[receiver.id]) : null
            ];
        }).spread((conversation, sender, receiver, receiverLocations, booking, senderMedia, receiverMedia) => {
            // do not obfuscate phone if booking is paid and accepted
            // Otherwise, expose 2 last digits of users' phones only
            var revealInfo = (booking && booking.paidDate && booking.acceptedDate);

            conversation = Conversation.expose(conversation, access);

            if (sender) {
                conversation.sender           = User.expose(sender, isSender ? access : "others");
                conversation.senderMedia      = senderMedia;
                conversation.sender.phonePart = revealInfo ? sender.phone : ToolsService.obfuscatePhone(sender.phone);
            }
            if (receiver) {
                conversation.receiver           = User.expose(receiver, isReceiver ? access : "others");
                conversation.receiverMedia      = receiverMedia;
                conversation.receiver.phonePart = revealInfo ? receiver.phone : ToolsService.obfuscatePhone(receiver.phone);
            }
            if (receiverLocations) {
                conversation.receiverLocations = Location.exposeAll(receiverLocations, access);
            }
            if (booking) {
                conversation.booking = Booking.expose(booking, access);
            }

            res.json(conversation);
        })
        .catch(res.sendError);
}

function getConversations(req, res) {
    // return all conversations for a given listing.id and/or user.id (but not conversation's messages)
    var userId         = req.param("userId");
    var shouldPopulate = req.param("populate");
    var filteredAttrs  = [
        "listingId",
        "senderId",
        "receiverId",
        "userId", // senderId or receiverId (only)
        "bookingId"
    ];
    var findAttrs = _.pick(req.allParams(), filteredAttrs);
    var access    = "self";

    if (! findAttrs.listingId
     && ! findAttrs.senderId
     && ! findAttrs.receiverId
     && ! findAttrs.userId
     && ! findAttrs.bookingId
    ) {
        return res.badRequest();
    }

    if (findAttrs.userId) {
        findAttrs = {
            $or: [
                { senderId: findAttrs.userId },
                { receiverId: findAttrs.userId }
            ]
        };
    }

    return Promise
        .resolve()
        .then(() => {
            return Conversation
                .find(findAttrs)
                .sort({ createdDate: -1 });
        })
        .then(conversations => {
            conversations = _.filter(conversations, conversation => {
                return ! Conversation.isEmpty(conversation);
            });

            return _populateUsers(conversations, access);
        })
        .then(conversations => {
            if (! userId && ! shouldPopulate) {
                return conversations;
            }

            return populate(conversations);
        })
        .then(exposedConversations => res.json(exposedConversations))
        .catch(res.sendError);



    function populate(conversations) {
        return Promise
            .resolve()
            .then(() => {
                var assessmentsIds = _.uniq(_.reduce(conversations, (memo, conversation) => {
                    if (conversation.inputAssessmentId) {
                        memo.push(conversation.inputAssessmentId);
                    }
                    if (conversation.outputAssessmentId) {
                        memo.push(conversation.outputAssessmentId);
                    }
                    return memo;
                }, []));
                var listingsIds   = _.uniq(_.pluck(conversations, "listingId"));
                var bookingIds = _.uniq(_.pluck(conversations, "bookingId"));

                return [
                    Assessment.find({ _id: assessmentsIds }),
                    Listing.getListingsOrSnapshots(listingsIds),
                    Booking.find({ _id: bookingIds })
                ];
            })
            .spread((assessments, listings, bookings) => {
                var indexedAssessments = _.indexBy(assessments, "id");
                var indexedListings    = _.indexBy(listings, "id");
                var indexedBookings    = _.indexBy(bookings, "id");

                _.forEach(conversations, conversation => {
                    var inputAssessment;
                    var outputAssessment;
                    var listing;
                    var booking;
                    var error;

                    if (conversation.inputAssessmentId) {
                        inputAssessment = indexedAssessments[conversation.inputAssessmentId];
                        if (! inputAssessment) {
                            error = new Error("missing input assessment");
                            error.conversationId = conversation.id;
                            error.inputAssessmentId = conversation.inputAssessmentId;
                            throw error;
                        }
                        conversation.inputAssessment = inputAssessment;
                    }
                    if (conversation.outputAssessmentId) {
                        outputAssessment = indexedAssessments[conversation.outputAssessmentId];
                        if (! outputAssessment) {
                            error = new Error("missing output assessment");
                            error.conversationId = conversation.id;
                            error.outputAssessmentId = conversation.outputAssessmentId;
                            throw error;
                        }
                        conversation.outputAssessment = outputAssessment;
                    }
                    if (conversation.listingId) {
                        listing = indexedListings[conversation.listingId];
                        if (! listing) {
                            error = new Error("missing listing");
                            error.conversationId = conversation.id;
                            error.listingId = conversation.listingId;
                            throw error;
                        }
                        conversation.listing = listing;
                    }
                    if (conversation.bookingId) {
                        booking = indexedBookings[conversation.bookingId];
                        if (! booking) {
                            error = new Error("missing booking");
                            error.conversationId = conversation.id;
                            error.bookingId = conversation.bookingId;
                            throw error;
                        }
                        // custom exposition
                        conversation.booking = {
                            id: booking.id,
                            takerId: booking.takerId,
                            paidDate: booking.paidDate,
                            acceptedDate: booking.acceptedDate
                        };
                    }
                });

                return conversations;
            });
    }
}

function getPublicMessages(req, res) {
    var listingId = req.param("listingId");
    var access = "others";

    return Promise
        .resolve()
        .then(() => {
            return Conversation.find({ listingId: listingId });
        })
        .then(conversations => {
            var conversationIds = _.pluck(conversations, "id");

            // max two messages with public content in same conversation
            return Message
                .find({
                    conversationId: conversationIds,
                    publicContent: { $ne: null }
                })
                .sort({
                    conversationId: -1,
                    createdDate: 1
                });
        })
        .then(messages => {
            return _populateUsers(messages, access);
        })
        .then(exposedMessages => res.json(exposedMessages))
        .catch(res.sendError);
}

function _populateUsers(conversationsOrMessages, access) {
    var userAccess = "others";
    access = access || "others";

    return Promise
        .resolve()
        .then(() => {
            return [
                User.find({ _id: _.pluck(conversationsOrMessages, "senderId") }),
                User.find({ _id: _.pluck(conversationsOrMessages, "receiverId") })
            ];
        })
        .spread((senders, receivers) => {
            return [
                senders,
                receivers,
                User.getMedia(senders),
                User.getMedia(receivers)
            ];
        })
        .spread((senders, receivers, senderMedias, receiverMedias) => {
            var indexedSenders   = _.indexBy(senders, "id");
            var indexedReceivers = _.indexBy(receivers, "id");

            return _.map(conversationsOrMessages, record => {
                if (record.conversationId) {
                    record = Message.expose(record, access);
                } else {
                    record = Conversation.expose(record, access);
                }

                var sender   = indexedSenders[record.senderId];
                var receiver = indexedReceivers[record.receiverId];

                // user data exposition is stricter
                record.sender      = User.expose(sender, userAccess);
                record.senderMedia = senderMedias[record.senderId];

                record.receiver      = User.expose(receiver, userAccess);
                record.receiverMedia = receiverMedias[record.receiverId];

                return record;
            });
        });
}

function _populateBookings(messages, access) {
    const rawMessages = messages.map(message => message.toJSON());

    var bookingIds = _.compact(_.pluck(messages, "bookingId"));

    if (! bookingIds.length) {
        return Promise.resolve(messages);
    }

    return Promise
        .resolve()
        .then(() => {
            return Booking.find({ _id: bookingIds });
        })
        .then(bookings => {
            var cancellationIds = _.compact(_.pluck(bookings, "cancellationId"));

            return [
                bookings,
                Cancellation.find({ _id: cancellationIds })
            ];
        })
        .spread((bookings, cancellations) => {
            var hashBookings      = _.indexBy(bookings, "id");
            var hashCancellations = _.indexBy(cancellations, "id");

            _.forEach(rawMessages, function (message) {
                var booking = message.bookingId ? hashBookings[message.bookingId] : null;

                if (booking) {
                    booking = Booking.expose(booking, access);

                    var cancellation = booking.cancellationId ? hashCancellations[booking.cancellationId] : null;

                    if (cancellation) {
                        booking.cancellation = Cancellation.expose(cancellation, access);
                    }

                    message.booking = booking;
                }
            });

            return rawMessages;
        });
}

function markAsRead(req, res) {
    var id = req.param("id");
    var conversationId = req.param("conversationId"); // defined if record to update is a single Message (and not a Conversation)

    var filteredAttrs = [
        "read",
        "receiverRead",
        "senderRead"
    ];
    var updateAttrs = _.pick(req.allParams(), filteredAttrs);

    return Promise
        .resolve()
        .then(() => {
            if (conversationId) {
                return updateMessage();
            } else {
                return updateConversation();
            }
        })
        .then(result => res.json(result))
        .catch(res.sendError);



    function updateMessage() {
        return Message
            .findByIdAndUpdate(id, _.pick(updateAttrs, "read"), { new: true })
            .then(message => {
                return Message.expose(message, "self");
            });
    }

    function updateConversation() {
        return Promise
            .resolve()
            .then(() => {
                return [
                    Conversation.findByIdAndUpdate(id, _.pick(updateAttrs, ["receiverRead", "senderRead"]), { new: true }),
                    Message.update({ conversationId: id }, _.pick(updateAttrs, "read"))
                ];
            })
            .spread(conversation => {
                return Conversation.expose(conversation, "self");
            });
    }
}

// Update conversation without new message
function updateMeta(req, res) {
    var id = req.param("id");
    var filteredAttrs = [
        "bookingId", // taker updates, but generating new empty message is preferred (for conversation CTAs)
        "bookingStatus", // taker
        "agreementStatus", // giver updates
        "startDate", // taker
        "endDate", // taker
        "receiverRead", // taker
        "senderRead" // giver
    ];
    var updateAttrs = _.pick(req.allParams(), filteredAttrs);

    updateAttrs.newContentDate = moment().toISOString();

    return Conversation
        .findByIdAndUpdate(id, updateAttrs, { new: true })
        .then(conversation => {
            res.json(Conversation.expose(conversation, "self"));
        })
        .catch(res.sendError);
}
