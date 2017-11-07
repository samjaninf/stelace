/* global GamificationService, GeneratorService, mangopay, OdooService, TimeService, ToolsService */

const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');
const moment = require('moment');
const uuid   = require('uuid');

const { extendSchema } = require('./util');
const Link = require('./Link');
const Location = require('./Location');
const Media = require('./Media');
const Token = require('./Token');
const UserXTag = require('./UserXTag');

const UserSchema = mongoose.Schema({
    username: String,
    firstname: String,
    lastname: String,
    description: {
        type: String,
        maxLength: 1000,
    },
    phone: String,
    phoneCountryCode: String,
    phoneCheck: {
        type: Boolean,
        default: false,
    },
    role: {
        type: String,
        default: 'user',
    },
    email: {       // email is not required in case if user recreates an account later (can be set to null)
        type: String,
        index: true,
        unique: true,
        sparse: true,
    },
    emailToken: String,
    emailCheck: {
        type: Boolean,
        default: false,
    },
    freeFeesDate: String,
    mediaId: mongoose.Schema.Types.ObjectId,
    tagsIds: [mongoose.Schema.Types.ObjectId],
    lastConnectionDate: Date,
    ratingScore: {
        type: Number,
        default: 0,
    },
    nbRatings: {
        type: Number,
        default: 0,
    },
    points: Number,
    lastViewedPoints: Number,
    levelId: String,
    lastViewedLevelId: String,
    birthday: String,
    nationality: String,
    countryOfResidence: String,
    address: Object,
    registrationCompleted: {
        type: Boolean,
        default: false,
    },
    firstUse: {
        type: Boolean,
        default: true,
    },
    mangopayUserId: String,
    walletId: String,
    bankAccountId: String,
    blocked: {       // use it if the user is to be banned temporarily
        type: Boolean,
        default: false,
    },
    destroyed: {
        type: Boolean,
        default: false,
    },
    iban: String,
    newsletter: { // if true, we can send newsletter
        type: Boolean,
        default: true,
    },
});

extendSchema(UserSchema);
UserSchema.plugin(uniqueValidator);

const params = {
    maxNbLocations: 4,
    freeFees: {
        minLevelId: "BEGINNER",
        duration: { // 3 months and 1 day
            M: 3,
            d: 1
        }
    }
};

UserSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "username",
            "firstname",
            "lastname",
            "description",
            "phone",
            "phoneCheck",
            "role",
            "email",
            "emailCheck",
            "freeFeesDate",
            "mediaId",
            "tagsIds",
            "ratingScore",
            "nbRatings",
            "birthday",
            "nationality",
            "countryOfResidence",
            "address",
            "registrationCompleted",
            "firstUse",
            "mangopayAccount", // boolean on the existence of 'mangopayUserId'
            "wallet", // boolean on the existence of 'walletId'
            "bankAccount", // boolean on the existence of 'bankAccountId'
            "iban",
            "newsletter",
            "points",
            "lastViewedPoints",
            "levelId",
            "lastViewedLevelId",
            "createdDate"
        ],
        others: [
            "id",
            "username",
            "firstname",
            "lastname",
            "description",
            "phoneCheck",
            "emailCheck",
            "ratingScore",
            "nbRatings",
            "points",
            "levelId",
            "createdDate"
        ]
    };

    return accessFields[access];
};

UserSchema.statics.exposeTransform = function (element, field, access) {
    switch (field) {
        case "mangopayAccount":
            element.mangopayAccount = !! element.mangopayUserId;
            break;

        case "wallet":
            element.wallet = !! element.walletId;
            break;

        case "bankAccount":
            element.bankAccount = !! element.bankAccountId;
            break;

        case "iban":
            element.iban = element.iban && ToolsService.obfuscateString(element.iban, 8, true);
            break;

        case "lastname":
            var shortLastname = element.lastname && element.lastname.charAt(0) + ".";
            element.lastname = (access === "self") ? element.lastname : shortLastname;
            break;
    }
};

UserSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

UserSchema.methods.hasSameId = function (id) {
    return µ.isSameId(this.id, id);
};

UserSchema.statics.hasSameId = function (user, id) {
    if (typeof user !== "object" || !user.id) {
        return false;
    }

    return µ.isSameId(user.id, id);
};

UserSchema.statics.getName = function (user, notFull) {
    if (user.firstname && user.lastname) {
        if (notFull) {
            return user.firstname + " " + user.lastname.charAt(0) + ".";
        } else {
            return user.firstname + " " + user.lastname;
        }
    } else if (user.firstname) {
        return user.firstname;
    } else if (user.email) {
        return user.email.split("@")[0];
    } else if (user.username) {
        return user.username;
    } else {
        return "";
    }
};

UserSchema.statics.createMangopayUser = async function (user, {
    birthday,
    nationality,
    countryOfResidence,
}) {
    if (user.mangopayUserId) {
        return user;
    }

    if (! birthday || ! TimeService.isDateString(birthday, { onlyDate: true })
        || ! nationality
        || ! countryOfResidence
    ) {
        throw new Error("Missing or bad parameters");
    }

    const mangopayUser = await mangopay.user.createNatural({
        body: {
            Email: user.email,
            FirstName: user.firstname,
            LastName: user.lastname,
            Birthday: parseInt(moment(new Date(birthday)).format("X"), 10), // unix timestamp
            Nationality: nationality,
            CountryOfResidence: countryOfResidence,
        },
    });

    user.birthday = birthday; // can be fake birthday (client-side default). Update from client side if touched inputs
    user.nationality = nationality;
    user.countryOfResidence = countryOfResidence;
    user.mangopayUserId = mangopayUser.Id;
    user = await user.save();

    return user;
};

UserSchema.statics.createWallet = async function (user) {
    if (!user.mangopayUserId) {
        throw new Error("Missing mangopayUserId");
    }
    if (user.walletId) {
        return user;
    }

    const wallet = await mangopay.wallet.create({
        body: {
            Owners: [user.mangopayUserId],
            Description: "Main wallet",
            Currency: "EUR", // TODO: allow other currencies
        },
    });

    user.walletId = wallet.Id;
    user = await user.save();
    return user;
};

UserSchema.statics.createBankAccount = async function (user) {
    if (!user.mangopayUserId) {
        throw new Error("Missing mangopayUserId");
    }
    if (!user.iban
        || !user.address
        || !user.address.name
        || (!user.address.establishment && !user.address.street)
        || !user.address.city
        || !user.address.postalCode
    ) {
        throw new Error("Missing params");
    }

    if (user.bankAccountId) {
        return user;
    }

    const bankAccount = await mangopay.bankAccount.create({
        userId: user.mangopayUserId,
        type: "IBAN",
        body: {
            OwnerName: this.getName(user),
            OwnerAddress: {
                AddressLine1: Location.getAddress(user.address, true, false),
                City: user.address.city,
                PostalCode: user.address.postalCode,
                Country: "FR"
            },
            IBAN: user.iban,
        },
    });

    user.bankAccountId = bankAccount.Id;
    user = await user.save();
    return user;
};

/**
 * sync odoo user
 * @param  {object}  args
 * @param  {boolean} args.updateLocation - if set to true, update location if the user exists
 * @param  {boolean} args.doNotCreateIfNone - do nothing if there is no odoo user
 * @return {Promise<object>} user
 */
UserSchema.statics.syncOdooUser = async function (user, args) {
    args = args || {};

    const odooId = await OdooService.getPartnerId(user.id);
    let location;

    if (odooId) {
        var params = {
            name: this.getName(user),
            email: user.email,
            phone: user.phone
        };

        if (args.updateLocation) {
            location = Location.getBillingLocation(user);
            if (location) {
                params.street     = location.street;
                params.postalCode = location.postalCode;
                params.city       = location.city;
            }
        }

        await OdooService.updatePartner(odooId, params);
    } else {
        location = await Location.getBillingLocation(user);

        await OdooService.createPartner({
            userId: user.id,
            name: this.getName(user),
            email: user.email,
            phone: user.phone,
            street: location ? location.street : null,
            postalCode: location ? location.postalCode : null,
            city: location ? location.city : null
        });
    }

    // odooId is not always defined
    user.odooId = odooId;
    return user;
};

/**
 * @param {Object[]} users - Users to retrieve media for
 */
UserSchema.statics.getMedia = async function (users) {
    var mediasIds = _.uniq(_.pluck(users, "mediaId"));
    mediasIds = _.without(mediasIds, null);

    const medias = await Media.find({ _id: mediasIds });
    var indexedMedias = _.indexBy(medias, "id");

    var hashMedias = _.reduce(users, function (memo, user) {
        if (! memo[user.id]) {
            memo[user.id] = indexedMedias[user.mediaId];
        }
        return memo;
    }, {});

    return hashMedias;
};

UserSchema.statics.createCheckEmailToken = async function (user, email) {
    const randomString = await GeneratorService.getRandomString(30);

    return await Token.create({
        type: "EMAIL_CHECK",
        value: randomString,
        userId: user.id,
        reference: {
            email: email
        }
    });
};

/**
 * @param {integer} userId - current user id
 * @param {integer[]} tagIds - new tag ids associated to current user
 * @return {Promise<object>} user
 */
UserSchema.statics.updateTags = async function (user, tagIds) {
    if (! tagIds) {
        return this.findById(user.id);
    } else if (! µ.checkArray(tagIds, "mongoId")) {
        throw new BadRequestError("Bad parameters");
    }

    const tagsIdsStr = tagIds.map(µ.getObjectIdString);
    var userXTags     = await UserXTag.find({ userId: user.id });
    var oldTagIdsStr     = _.pluck(userXTags, "tagId").map(µ.getObjectIdString);
    var addedTagIds   = _.difference(tagsIdsStr, oldTagIdsStr);
    var removedTagIds = _.difference(oldTagIdsStr, tagsIdsStr);

    if (addedTagIds.length) {
        await Promise
            .resolve(addedTagIds)
            .each(function (tagId) {
                return UserXTag
                    .create({
                        userId: user.id,
                        tagId: tagId
                    });
            });
    }
    if (removedTagIds.length) {
        await UserXTag
            .remove({
                userId: user.id,
                tagId: removedTagIds
            });
    }

    return await this.findByIdAndUpdate(user.id, { tagsIds: tagIds }, { new: true });
};

UserSchema.statics.isFreeFees = function (user, refDate) {
    var refDay = moment(refDate).format("YYYY-MM-DD");
    return !! (user.freeFeesDate && refDay < user.freeFeesDate);
};

/**
 * can apply free fees
 * @param  {object} user
 * @param  {object} args
 * @param  {string} args.minLevelId
 * @return {boolean}
 */
UserSchema.statics.canApplyFreeFees = function (user, args) {
    args = args || _.defaults({}, params.freeFees);

    var errors = {};

    if (args.minLevelId) {
        var levelsOrder   = GamificationService.getLevelsOrder();
        var minLevelIndex = _.findIndex(levelsOrder, args.minLevelId);
        var levelIndex    = _.findIndex(levelsOrder, user.levelId);

        if (levelIndex < minLevelIndex) {
            errors.MIN_LEVEL = true;
        }
    }

    return exposeResult(errors);



    function exposeResult(errors) {
        return {
            result: ! _.keys(errors).length,
            errors: errors
        };
    }
};

function getNewFreeFeesDate(user, duration) {
    var formatDate = "YYYY-MM-DD";
    var oldFreeFeesDate = user.freeFeesDate || moment().format(formatDate);
    var newFreeFeesDate = moment(oldFreeFeesDate).add(duration).format(formatDate);

    return newFreeFeesDate;
}

/**
 * apply free fees
 * @param  {object} user
 * @param  {object} args
 * @param  {string} args.minLevelId
 * @param  {object} args.duration
 * @return {Promise<object>}
 */
UserSchema.statics.applyFreeFees = async function (user, args) {
    args = args || _.defaults({}, params.freeFees);

    if (! args.duration) {
        throw new Error("No duration provided");
    }

    var canApply = this.canApplyFreeFees(user, args);
    if (! canApply.result) {
        throw new Error("User can't apply no fees");
    }

    var newFreeFeesDate = getNewFreeFeesDate(user, args.duration);

    return await this.findByIdAndUpdate(user.id, { freeFeesDate: newFreeFeesDate }, { new: true });
};

UserSchema.statics.getPartnerRef = function (userId) {
    return `USR_${userId}`;
};

UserSchema.statics.getRefererInfo = async function (user) {
    var link = await Link.findOne({
        toUserId: user.id,
        relationship: "refer",
        validated: true
    });

    if (! link) {
        return;
    }

    var referer = await this.findById(link.fromUserId);
    if (! referer) {
        var error = new NotFoundError("Referer not found");
        error.userId = link.fromUserId;
        throw error;
    }

    return {
        link: link,
        referer: referer
    };
};

UserSchema.statics.generateAuthToken = async function (userId) {
    const expirationDuration = 30; // 30 days

    const token = await Token.create({
        type: 'authToken',
        value: uuid.v4(),
        userId,
        expirationDate: moment().add({ d: expirationDuration }).toISOString(),
    });
    return token;
};

UserSchema.pre('save', async function (next) {
    if (!this.isNew) {
        return next();
    }

    try {
        if (!this.username && this.email) {
            this.username = this.email.split('@')[0];
        }
        if (!this.emailToken) {
            this.emailToken = await GeneratorService.getRandomString(30);
        }
        next();
    } catch (err) {
        next(err);
    }
});

UserSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        // console.log('tojson', doc.id, ret.id)
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('User', UserSchema);
