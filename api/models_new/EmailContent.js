const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const EmailContentSchema = mongoose.Schema({
    mandrillMessageId: {
        type: String,
        index: true,
    },
    info: Object,
    content: Object,
});

extendSchema(EmailContentSchema);

EmailContentSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('EmailContent', EmailContentSchema);
