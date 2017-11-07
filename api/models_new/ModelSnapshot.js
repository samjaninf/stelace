const mongoose = require('mongoose');

const { extendSchema } = require('./util');

const ModelSnapshotSchema = mongoose.Schema({
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
    },
    targetType: String,
    data: Object,
});

extendSchema(ModelSnapshotSchema);

var params = {
    targetTypes: ['user', 'listing', 'location'],
};

ModelSnapshotSchema.statics.get = function (prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
};

function _exposeSnapshot(snapshot) {
    var obj = snapshot.data;
    obj.id = snapshot.id;
    obj.snapshot = true;

    return obj;
}

ModelSnapshotSchema.statics.getComparedFields = function (targetType) {
    var comparedFields;

    if (targetType === 'user') {
        comparedFields = [
            'username',
            'firstname',
            'lastname',
            'description',
            'phone',
            'phoneCountryCode',
            'phoneCheck',
            'role',
            'email',
            'emailCheck',
            'mediaId',
            'ratingScore',
            'nbRatings',
            'birthday',
            'nationality',
            'countryOfResidence',
            'address',
            'mangopayUserId',
            'walletId',
            'bankAccountId',
            'iban',
            'points',
            'levelId'
        ];
    } else if (targetType === 'listing') {
        comparedFields = [
            'name',
            'nameURLSafe',
            'description',
            'stateComment',
            'bookingPreferences',
            'accessories',
            'ownerId',
            'brandId',
            'reference',
            'listingCategoryId',
            'mediasIds',
            'instructionsMediasIds',
            'validated',
            'validationPoints',
            'ratingScore',
            'nbRatings',
            'autoBookingAcceptation',
            'locations',
            'listingTypesIds',
            'sellingPrice',
            'dayOnePrice',
            'pricingId',
            'customPricingConfig',
            'deposit',
            'acceptFree'
        ];
    } else if (targetType === 'location') {
        comparedFields = [
            'name',
            'alias',
            'streetNum',
            'street',
            'postalCode',
            'city',
            'department',
            'region',
            'latitude',
            'longitude',
            'transportMode',
            'userId',
            'establishment',
            'establishmentName',
            'provider',
            'remoteId'
        ];
    }

    return comparedFields;
};

ModelSnapshotSchema.statics.isIdentical = function (targetType, model, snapshot) {
    if (! _.contains(this.get('targetTypes'), targetType)) {
        return false;
    }

    var comparedFields = this.getComparedFields(targetType);

    var modelFields    = _.pick(model, comparedFields);
    var snapshotFields = _.pick(snapshot.data, comparedFields);

    return _.isEqual(modelFields, snapshotFields);
};

ModelSnapshotSchema.statics.getSnapshot = async function (targetType, model, force) {
    if (! _.contains(this.get('targetTypes'), targetType)
     || ! model || ! model.id
    ) {
        throw new Error('bad params');
    }

    let snapshot;

    if (!force) {
        snapshot = await this.findOne({
            targetId: model.id,
            targetType: targetType
        })
        .sort({ createdDate: -1 });
    }

    if (snapshot && this.isIdentical(targetType, model, snapshot)) {
        return _exposeSnapshot(snapshot);
    }

    snapshot = await this.create({
        targetId: model.id,
        targetType: targetType,
        data: _.pick(model, this.getComparedFields(targetType))
    });

    return _exposeSnapshot(snapshot);
};

ModelSnapshotSchema.statics.fetch = async function (snapshotIdOrIds) {
    const snapshots = await this.find({ _id: snapshotIdOrIds });

    var exposedSnapshots = _.map(snapshots, (snapshot) => {
        return _exposeSnapshot(snapshot);
    });

    if (! _.isArray(snapshotIdOrIds)) {
        if (snapshots.length) {
            return exposedSnapshots[0];
        } else {
            return null;
        }
    } else {
        return exposedSnapshots;
    }
};

ModelSnapshotSchema.statics.exposeSnapshot = function (snapshot, originalId) {
    var obj = _exposeSnapshot(snapshot);

    if (originalId) {
        obj._id = snapshot.targetId;
    }

    return obj;
};

ModelSnapshotSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('ModelSnapshot', ModelSnapshotSchema);
