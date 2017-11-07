/* global mangopay, TimeService */

const mongoose = require('mongoose');
const moment = require('moment');

const { extendSchema } = require('./util');

const CardSchema = mongoose.Schema({
    mangopayId: {
        type: String,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    expirationDate: String, // "MMYY"
    currency: String,
    provider: String, // "CB" || "VISA" || "MASTERCARD" ...
    type: String, // "CB_VISA_MASTERCARD"
    alias: String, // card number with missing characters (ex: "356999XXXXXX0165")
    active: Boolean,
    validity: String, // "UNKNOWN" || "VALID" || "INVALID"
    forget: { // if true, do not use again this card
        type: Boolean,
        default: false,
    },

    /*
        hash1 and hash2 are for card number unicity
        identical card number:
        cardA.hash1 === cardB.hash1 && cardA.hash2 === cardB.hash2
    */
    hash1: String,
    hash2: String,
});

extendSchema(CardSchema);

CardSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "userId",
            "expirationDate",
            "currency",
            "provider",
            "type",
            "alias",
            "active",
            "validity"
        ]
    };

    return accessFields[access];
};

CardSchema.methods.synchronize = async function () {
    const mangopayCard = await mangopay.card.fetch({ cardId: this.mangopayId });

    this.expirationDate = mangopayCard.ExpirationDate;
    this.currency = mangopayCard.Currency;
    this.provider = mangopayCard.CardProvider;
    this.type = mangopayCard.CardType;
    this.alias = mangopayCard.Alias;
    this.active = mangopayCard.Active;
    this.validity = mangopayCard.Validity;

    return await this.save();
};

CardSchema.methods.disable = async function () {
    await mangopay.card.edit({
        cardId: this.mangopayId,
        body: {
            Active: false
        },
    });

    this.active = false;
    return await this.save();
};

CardSchema.methods.isExpiredAt = function (expiredDate) {
    if (! TimeService.isDateString(expiredDate, { onlyDate: true })) {
        throw new Error("Bad value");
    }

    var card = this;

    var expirationYear  = parseInt("20" + card.expirationDate.substr(2, 2), 10);
    var expirationMonth = parseInt(card.expirationDate.substr(0, 2), 10);

    expiredDate = moment(expiredDate);
    var expiredYear  = expiredDate.year();
    var expiredMonth = expiredDate.month() + 1;

    return (expirationYear < expiredYear || (expirationYear === expiredYear && expirationMonth < expiredMonth));
};

CardSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Card', CardSchema);
