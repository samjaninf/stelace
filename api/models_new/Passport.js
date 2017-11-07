const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

Promise.promisifyAll(bcrypt);

const { extendSchema } = require('./util');

const PassportSchema = mongoose.Schema({
    protocol: {
        type: String,
        required: true,
    },
    password: String,
    provider: String,
    identifier: String,
    tokens: mongoose.Schema.Types.Mixed,
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
    },
});

extendSchema(PassportSchema);

/**
 * Validate password used by the local strategy.
 *
 * @param {string}   password The password to validate
 * @param {Function} next
 */
PassportSchema.methods.validatePassword = async function (password) {
    const matched = await bcrypt.compareAsync(password, this.password);
    return matched;
};

PassportSchema.pre('save', async function (next) {
    if (!this.isNew || !this.password) {
        return next();
    }

    try {
        this.password = await bcrypt.hashAsync(this.password, 10);
        next();
    } catch (err) {
        next(err);
    }
});

PassportSchema.pre('update', async function (next) {
    const updateQuery = this.getUpdate();

    try {
        if (updateQuery.$set.password) {
            this.update({}, {
                password: await bcrypt.hashAsync(updateQuery.$set.password, 10),
            });
        }
        next();
    } catch (err) {
        next(err);
    }
});

PassportSchema.pre('updateOne', async function (next) {
    const updateQuery = this.getUpdate();

    try {
        if (updateQuery.$set.password) {
            this.update({}, {
                password: await bcrypt.hashAsync(updateQuery.$set.password, 10),
            });
        }
        next();
    } catch (err) {
        next(err);
    }
});

PassportSchema.pre('findOneAndUpdate', async function (next) {
    const updateQuery = this.getUpdate();

    try {
        if (updateQuery.password) {
            this.update({}, {
                password: await bcrypt.hashAsync(updateQuery.password, 10),
            });
        }
        next();
    } catch (err) {
        next(err);
    }
});

PassportSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Passport', PassportSchema);
