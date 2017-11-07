const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const WebhookSchema = mongoose.Schema({
    apiKey: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    url: String,
});

extendSchema(WebhookSchema);

WebhookSchema.statics.getAccessFields = function (access) {
    const accessFields = {
        api: [
            'id',
            'url',
            'createdDate',
        ],
    };

    return accessFields[access];
};

WebhookSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Webhook', WebhookSchema);
