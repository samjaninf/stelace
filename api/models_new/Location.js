const mongoose = require('mongoose');

const { extendSchema } = require('./util');
const ModelSnapshot = require('./ModelSnapshot');

const LocationSchema = mongoose.Schema({
    name: String,
    alias: String,
    streetNum: String,
    street: String,
    postalCode: String,
    city: String,
    department: String,
    region: String,
    latitude: Number, // float
    longitude: Number, // float
    main: { // a user can only have one main location at a time
        type: Boolean,
        default: false,
    },
    transportMode: String,
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    establishment: Boolean,
    establishmentName: String, // prevents from exposing name to others
    provider: String,
    remoteId: String, // location id from map providers (for ex: 'place_id' for google map)
});

extendSchema(LocationSchema);

var params = {
    transportModes: ["car", "publicTransport"],
    providers: ["google"], // ["google", "nominatim"]
    gpsCoordsDecimal: 6
};

LocationSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "id",
            "name",
            "alias",
            "streetNum",
            "street",
            "postalCode",
            "city",
            "department",
            "region",
            "latitude",
            "longitude",
            "main",
            "transportMode",
            "userId",
            "establishment",
            "establishmentName",
            "provider",
            "remoteId"
        ],
        others: [
            "id",
            "street",
            "postalCode",
            "city",
            "department",
            "region",
            "latitude",
            "longitude",
            "main",
            "userId",
            "establishment",
            "establishmentName"
        ]
    };

    return accessFields[access];
};

LocationSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

LocationSchema.statics.getAddress = function (location, streetNum, city) {
    var address = "";

    if (location.establishment) {
        return location.name; // === establishmentName
    } else if (! location.city) {
        address = location.name;
    } else {
        if (city !== false) {
            address = location.city;
        }

        if (location.street) {
            address = location.street + (address ? ", " : "") + address;

            if (streetNum && location.streetNum) {
                address = location.streetNum + " " + address;
            }
        }
    }

    return address;
};

LocationSchema.statics.getBillingLocation = async function (user) {
    if (user.address) {
        return user.address;
    }

    return await this.findOne({
        userId: user.id,
        main: true
    });
};

LocationSchema.statics.getMainLocationSnapshot = async function (userId) {
    var location = await this.findOne({
        userId: userId,
        main: true
    });

    if (! location) {
        return;
    }

    return await ModelSnapshot.getSnapshot("location", location);
};

LocationSchema.pre('save', function (next) {
    if (this.establishment) {
        this.establishmentName = this.name;
    }
    next();
});

LocationSchema.pre('update', function (next) {
    const updateQuery = this.getUpdate();

    if (updateQuery.$set.establishment) {
        this.update({}, {
            establishmentName: updateQuery.$set.name,
        });
    }
    next();
});

LocationSchema.pre('updateOne', function (next) {
    const updateQuery = this.getUpdate();

    if (updateQuery.$set.establishment) {
        this.update({}, {
            establishmentName: updateQuery.$set.name,
        });
    }
    next();
});

LocationSchema.pre('findOneAndUpdate', function (next) {
    const updateQuery = this.getUpdate();

    if (updateQuery.establishment) {
        this.findOneAndUpdate({}, {
            establishmentName: updateQuery.name,
        });
    }
    next();
});

LocationSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Location', LocationSchema);
