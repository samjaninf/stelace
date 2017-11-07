const {
    User,
} = require('../models_new');

module.exports = function (req, res, next) {

    return Promise
        .resolve()
        .then(() => {
            // for anonymous users
            if (! req.user || ! req.user.id) {
                return;
            }

            return User
                .findById(req.user.id)
                .then(user => {
                    if (! user) {
                        throw new NotFoundError("user not found");
                    }

                    req.user = user;
                    return;
                });
        })
        .asCallback(next);

};
