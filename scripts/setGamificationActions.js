/* global BootstrapService, GamificationService, LoggerService */

var Sails = require('sails');
var yargs = require('yargs');

global._       = require('lodash');
global.Promise = require('bluebird');

const {
    User,
} = require('../api/models_new');

var argv = yargs
            .usage("Usage: $0 --actionId [string] --usersIds [ObjectId[]]")
            .demand("actionId")
            .demand("usersIds")
            .argv;

var actionId = argv.actionId;
var usersIds;

if (typeof argv.actionId !== "string") {
    console.log("actionId must be a string.");
    process.exit();
}

try {
    usersIds = JSON.parse(argv.usersIds);

    if (! _.isArray(usersIds) || ! µ.checkArray(usersIds, 'mongoId')) {
        console.log("usersIds must be an array of ObjectId.");
        process.exit();
    }
} catch (e) {
    console.log("usersIds has a bad format.");
    process.exit();
}

Sails.load({
    models: {
        migrate: "safe"
    },
    hooks: {
        grunt: false,
        sockets: false,
        pubsub: false,
        orm: false,
    }
}, function (err, sails) {
    if (err) {
        console.log("\n!!! Fail script launch: can't load sails");
        return;
    }

    BootstrapService.init(null, { sails: sails });

    var logger = LoggerService.getLogger("script");

    return Promise
        .resolve()
        .then(() => {
            var actions = GamificationService.getActions();
            if (! actions[actionId]) {
                throw new Error("Gamification action doesn't exist.");
            }

            return User.find({ _id: usersIds });
        })
        .then(users => {
            var indexedUsers = _.indexBy(users, "id");
            var notFoundUsersId = _.reduce(usersIds, (memo, userId) => {
                if (! indexedUsers[userId]) {
                    memo.push(userId);
                }
                return memo;
            }, []);

            if (notFoundUsersId.length) {
                throw new Error("Not found users: " + JSON.stringify(notFoundUsersId));
            }

            return [
                users,
                GamificationService.getUsersStats(users)
            ];
        })
        .spread((users, usersStats) => {
            return Promise
                .resolve(users)
                .map(user => {
                    var actionsIds = [actionId];
                    var userStats  = usersStats[user.id];

                    return GamificationService.setActions(user, actionsIds, null, logger, userStats);
                });
        })
        .then(() => {
            console.log("Success");
        })
        .catch(err => {
            console.log(err.stack);
        })
        .finally(() => {
            sails.lowerSafe();
        });
});
