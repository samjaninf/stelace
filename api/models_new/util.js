const mongoose = require('mongoose');
const timestamps = require('mongoose-timestamp');

module.exports = {
    extendSchema,

    addTimestamps,
    addExpose,
    setFieldId,
};

function extendSchema(Schema, { timestamps = true, expose = true } = {}) {
    if (timestamps) {
        addTimestamps(Schema);
    }
    if (expose) {
        addExpose(Schema);
    }
}

function addTimestamps(Schema) {
    Schema.plugin(timestamps, {
        createdAt: 'createdDate',
        updatedAt: 'updatedDate',
    });
}

function addExpose(Schema) {
    Schema.statics.expose = (element, access = 'others') => {
        const object = element && typeof element === 'object' && typeof element.toJSON === 'function' ? element.toJSON() : _.cloneDeep(element);

        if (access === 'admin') {
            return object;
        }
        if (typeof element === 'undefined' || element === null) {
            return null;
        }
        if (typeof Schema.statics.getAccessFields !== 'function') {
            return {};
        }

        var accessFields = Schema.statics.getAccessFields(access);
        if (!accessFields) {
            return {};
        }

        if (typeof Schema.statics.exposeTransform === 'function') {
            accessFields.forEach(field => {
                Schema.statics.exposeTransform(object, field, access);
            });
        }
        return _.pick(object, accessFields);
    };

    Schema.statics.exposeAll = (elements, access = 'others') => {
        if (!_.isArray(elements)) {
            throw new Error('expected array');
        }

        return elements.reduce((memo, element) => {
            memo.push(Schema.statics.expose(element, access));
            return memo;
        }, []);
    };
}

function setFieldId({ ret }, { fieldRef, fieldId, array = false }) {
    if (array) {
        _setFieldIdArray({ ret }, { fieldRef, fieldId });
    } else {
        _setFieldIdString({ ret }, { fieldRef, fieldId });
    }
}

function _setFieldIdArray({ ret }, { fieldRef, fieldId }) {
    if (!ret[fieldId]) {
        ret[fieldId] = [];
        return;
    }

    const ids = [];
    ret[fieldRef].forEach(value => {
        if (value instanceof mongoose.Types.ObjectId) {
            ids.push(value);
        } else if (typeof value === 'object' && (value._id || value.id)) {
            ids.push(value._id || value.id);
        }
    });

    ret[fieldId] = ids;
}

function _setFieldIdString({ ret }, { fieldRef, fieldId }) {
    if (!ret[fieldRef]) {
        ret[fieldId] = null;
        return;
    }

    if (ret[fieldRef] instanceof mongoose.Types.ObjectId) {
        ret[fieldId] = ret[fieldRef];
    } else if (typeof ret[fieldRef] === 'object' && (ret[fieldRef]._id || ret[fieldRef].id)) {
        ret[fieldId] = ret[fieldRef]._id || ret[fieldRef].id;
    }
}
