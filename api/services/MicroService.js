module.exports = {

    isEmail: isEmail,
    isMongoId: isMongoId,
    getObjectIdString: getObjectIdString,
    includesObjectId: includesObjectId,
    isSameId: isSameId,
    checkArray: checkArray,
    sendError: sendError,
    getPrivateIp: getPrivateIp,
    existsSync: existsSync,
    getSize: getSize,

};

const fs = require('fs');
const os = require('os');
const mongoose = require('mongoose');

Promise.promisifyAll(fs);

function isEmail(emailToTest, maxLength) {
    maxLength = maxLength || 255;
    var emailRegex = /^[a-z0-9._-]+@[a-z0-9._-]{2,}\.[a-z]{2,}$/;
    return (typeof emailToTest === "string") && (emailRegex.test(emailToTest)) && (emailToTest.length < maxLength);
}

function isMongoId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function getObjectIdString(id) {
    if (!isMongoId(id)) {
        throw new Error('Expected valid ObjectId');
    }

    if (id instanceof mongoose.Types.ObjectId) {
        return id.toHexString();
    } else {
        return id;
    }
}

function includesObjectId(array, id) {
    return array.reduce((memo, value) => {
        if (isSameId(value, id)) {
            return true;
        }
        return memo;
    }, false);
}

function isSameId(id1, id2) {
    if ((!(id1 instanceof mongoose.Types.ObjectId) && typeof id1 !== 'string')
     || (!(id2 instanceof mongoose.Types.ObjectId) && typeof id2 !== 'string')
    ) {
        return false;
    }

    if (id1 instanceof mongoose.Types.ObjectId) {
        return id1.equals(id2);
    } else {
        try {
            return mongoose.Types.ObjectId(id1).equals(id2);
        } catch (e) {
            return false;
        }
    }
}

function checkArray(arrayToTest, typeOrFunction, options) {
    if (! _.isArray(arrayToTest)) {
        return false;
    }

    options = options || {};
    var isValid;

    if (typeOrFunction === "id") {
        isValid = function (item) {
            return ! isNaN(item) && item > 0;
        };
    } else if (typeOrFunction === 'mongoId') {
        isValid = function (item) {
            return isMongoId(item);
        }
    } else if (typeOrFunction === "string") {
        isValid = function (item) {
            return (typeof item === "string") && (options.maxLength ? item.length <= options.maxLength : true);
        };
    } else { // typeof typeOrFunction === "function"
        isValid = typeOrFunction;
    }

    return _.reduce(arrayToTest, function (memo, item) {
        if (isValid(item)) {
            return memo;
        } else {
            return memo && false;
        }
    }, true);
}

function sendError(res) {
    return function (err) {
        if (err === "stop" || (err instanceof Error && err.message === "stop")) {
            return;
        }

        if (err instanceof BadRequestError) {
            res.badRequest(err);
        } else if (err instanceof ForbiddenError) {
            res.forbidden(err);
        } else if (err instanceof NotFoundError) {
            res.notFound(err);
        } else {
            res.serverError(err);
        }
    };
}

function getPrivateIp() {
    var privateIpRegex = /^192.168.\d{1,3}.\d{1,3}$/;
    var networks = os.networkInterfaces();
    var privateIp = null;

    _.forEach(networks, function (network) {
        if (privateIp) {
            return;
        }

        _.forEach(network, function (config) {
            if (privateIp) {
                return;
            }

            if (config.address && privateIpRegex.test(config.address)) {
                privateIp = config.address;
            }
        });
    });

    return privateIp;
}

function existsSync(filepath) {
    try {
        fs.accessSync(filepath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Get the size of a file path
 * @param  {string} filepath
 * @return {[type]}
 */
async function getSize(filepath) {
    const stats = await fs.statAsync(filepath);
    return stats.size;
}
