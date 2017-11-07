const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const EmailLogSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    fromEmail: String,
    fromName: String,
    toEmail: String,
    toName: String,
    replyTo: String,
    specificTemplateName: {
        type: String,
        index: true,
    },
    templateName: String,
    subject: String,
    data: Object,
    tags: [String],
    sentDate: Date,
    status: String,
    mandrillMessageId: {
        type: String,
        index: true,
    },
    sparkpostTransmissionId: {
        type: String,
        index: true,
    },
    html: String,
});

extendSchema(EmailLogSchema);

EmailLogSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('EmailLog', EmailLogSchema);
