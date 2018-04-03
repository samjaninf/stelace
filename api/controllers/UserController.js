/* global
    AclService, AuthService, EmailTemplateService, GamificationService, GeneratorService,
    IncomeReportService, Location, Media, MicroService, Passport, StelaceConfigService, StelaceEventService, Token, TokenService, ToolsService, User, UserService
*/

/**
 * UserController
 *
 * @description :: Server-side logic for managing users
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {

    find,
    findOne,
    create,
    update,
    destroy,

    me,
    params,
    getAuthMeans,
    getMyPermissions,
    updateAddress,
    updatePassword,
    updateEmail,
    updatePhone,
    lostPassword,
    recoveryPassword,
    emailNew,
    emailCheck,
    updateMedia,
    unsubscribeLink,
    applyFreeFees,
    getIncomeReport,
    getIncomeReportPdf,

    getPaymentAccounts,

};

var moment = require('moment');
var fs     = require('fs');
const _ = require('lodash');
const Promise = require('bluebird');
const createError = require('http-errors');

Promise.promisifyAll(fs);

function find(req, res) {
    var query = req.param("q");
    var access = "self";

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }

    return Promise
        .resolve()
        .then(() => {
            query = query.trim();

            if (! query) {
                return {};
            }

            var queryConfig = getQueryConfig(query);

            return Promise.props({
                ids: User.find({ id: queryConfig.ids }),
                emails: User.find({
                    or: _.map(queryConfig.emails, str => ({ email: { contains: str } }))
                }),
                firstnames: User.find({
                    or: _.map(queryConfig.firstnames, str => ({ firstname: { contains: str } }))
                }),
                lastnames: User.find({
                    or: _.map(queryConfig.lastnames, str => ({ lastname: { contains: str } }))
                }),
                aggFirstnames: User.find({
                    or: _.map(queryConfig.aggregates, str => ({ firstname: { contains: str } }))
                }),
                aggLastnames: User.find({
                    or: _.map(queryConfig.aggregates, str => ({ lastname: { contains: str } }))
                })
            });
        })
        .then(result => {
            var fields = [
                "ids",
                "emails",
                "firstnames",
                "lastnames",
                "aggFirstnames",
                "aggLastnames"
            ];

            var cacheUsers = {};

            _.forEach(fields, field => {
                var users = result[field];

                _.forEach(users, user => {
                    if (cacheUsers[user.id]) {
                        ++cacheUsers[user.id].score;
                    } else {
                        cacheUsers[user.id] = {
                            user: user,
                            score: 1
                        };
                    }
                });
            });

            var users = _(cacheUsers)
                .values()
                .sortByOrder(["score", "id"], ["desc", "asc"])
                .map(obj => obj.user)
                .value();

            res.json(User.exposeAll(users, access));
        })
        .catch(res.sendError);



    function getNumber(str) {
        var parsedStr = parseInt(str, 10);
        return ! isNaN(parsedStr) ? parsedStr : null;
    }

    function getQueryConfig(query) {
        var queryConfig = {
            ids: [],
            emails: [],
            firstnames: [],
            lastnames: [],
            aggregates: []
        };

        var tokens = _.compact(query.split(" "));

        _.forEach(tokens, token => {
            var tokenId = getNumber(token);

            if (tokenId) {
                queryConfig.ids.push(tokenId);
            } else {
                if (isEnoughLongToken(token)) {
                    queryConfig.emails.push(token);
                    queryConfig.firstnames.push(token);
                    queryConfig.lastnames.push(token);
                }
            }
        });

        var aggregateStr = "";
        _.forEach(tokens, token => {
            aggregateStr += (aggregateStr ? " " : "") + token;

            if (isEnoughLongToken(aggregateStr)) {
                queryConfig.aggregates.push(aggregateStr);
            }
        });

        return queryConfig;
    }

    function isEnoughLongToken(token) {
        return token.length >= 3;
    }
}

async function findOne(req, res) {
    const id = req.param('id');
    const access = 'others';

    try {
        let { user, media } = await UserService.findUser(id, { populateMedia: true });

        user = User.expose(user, access);
        user.media = Media.expose(media, access);

        const hasValidPhone = user.phone && user.phoneCheck;
        const userPhone     = user.phone;

        if (hasValidPhone) {
            user.phonePart = ToolsService.obfuscatePhone(userPhone);
        }

        res.json(user);
    } catch (err) {
        res.sendError(err);
    }
}

function create(req, res) {
    return res.forbidden();
}

async function update(req, res) {
    const filteredAttrs = [
        'organizationName',
        'firstname',
        'lastname',
        'tagsIds',
        'description',
        'birthday',
        'countryOfResidence',
        'userType',
        'iban',
    ];
    const updateAttrs = _.pick(req.allParams(), filteredAttrs);
    const access = "self";

    if (updateAttrs.userType && !User.isValidUserType(updateAttrs.userType)) {
        throw createError(400, 'Incorrect user type');
    }
    if (updateAttrs.userType && !User.canChangeUserType(req.user) && updateAttrs.userType !== req.user.userType) {
        throw createError(400, 'Cannot change the user type');
    }

    let user = await User.updateOne(req.user.id, Object.assign({}, updateAttrs));
    user = await User.updateTags(user, updateAttrs.tagsIds);

    const actionsIds = [
        'ADD_FIRSTNAME',
        'ADD_LASTNAME',
        'ADD_DESCRIPTION',
    ];

    GamificationService.checkActions(user, actionsIds, null, req.logger, req);

    User
        .syncOdooUser(user, {
            updateLocation: false,
            doNotCreateIfNone: true
        })
        .catch(err => {
            req.logger.warn({ err: err }, "Odoo sync user fail");
        });

    res.json(User.expose(user, access));
}

async function destroy(req, res) {
    const id = parseInt(req.param('id'), 10);

    try {
        if (req.user.id !== id) {
            throw createError(403);
        }

        await UserService.destroyUser(id, {
            keepCommittedBookings: true,
            trigger: 'owner',
        }, { req, res });

        res.json({ id });
    } catch (err) {
        res.sendError(err);
    }
}

function me(req, res) {
    var access = "self";

    return res.json(User.expose(req.user, access));
}

function params(req, res) {
    return res.json({
        maxNbLocations: User.get("maxNbLocations"),
        freeFees: User.get("freeFees")
    });
}

async function getAuthMeans(req, res) {
    try {
        const result = await AuthService.getAuthMeans(req.user.id);
        res.json(result);
    } catch (err) {
        res.sendError(err);
    }
}

async function getMyPermissions(req, res) {
    const permissions = await AclService.getUserPermissions(req.user);
    res.json(permissions);
}

function updateAddress(req, res) {
    var filteredAttrs = [
        "name",
        "streetNum",
        "street",
        "postalCode",
        "city",
        "department",
        "region",
        "latitude",
        "longitude",
        "establishment",
        "provider",
        "remoteId"
    ];
    var updateAttrs = _.pick(req.allParams(), filteredAttrs);
    var access = "self";

    if (! updateAttrs.name
     || (! updateAttrs.establishment && ! updateAttrs.street)
     || ! updateAttrs.city
     || ! updateAttrs.latitude
     || ! updateAttrs.longitude
     || ! updateAttrs.provider || ! _.contains(Location.get("providers"), updateAttrs.provider)
     || ! updateAttrs.remoteId
    ) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return User.updateOne(req.user.id, { address: updateAttrs });
        })
        .then(user => {
            res.json(User.expose(user, access));
        })
        .catch(res.sendError);
}

function updatePassword(req, res) {
    var id              = req.param("id");
    var oldPassword     = req.param("oldPassword");
    var newPassword     = req.param("newPassword");
    var skipOldPassword = req.param("skipOldPassword");

    var self    = User.hasSameId(req.user, id);
    var isAdmin = TokenService.isRole(req, "admin");

    if ((! self && ! isAdmin)
     || (! isAdmin && skipOldPassword)
    ) {
        return res.forbidden();
    }
    if (typeof newPassword !== "string") {
        return res.badRequest();
    }

    // TODO: check if a local user must be created
    return Promise
        .resolve()
        .then(() => {
            return Passport.find({ user: id });
        })
        .then(passports => {
            var splitPassports = _.partition(passports, passport => {
                return passport.protocol === "local";
            });
            var localPassport     = _.first(splitPassports[0]);
            var notLocalPassports = splitPassports[1];

            // no passport at all, it can't happen normally
            if (! localPassport && ! notLocalPassports.length) {
                var error = new Error("No passport");
                error.userId = id;
                throw error;
            }

            // user from social networks
            if (! localPassport && notLocalPassports.length) {
                return Passport.create({
                    protocol: "local",
                    password: newPassword,
                    user: id
                });
            } else if (skipOldPassword) {
                return Passport.updateOne(localPassport.id, { password: newPassword });
            } else {
                if (typeof oldPassword !== "string") {
                    throw createError(400);
                }

                return Passport
                    .validatePassword(localPassport, oldPassword)
                    .then(match => {
                        if (! match) {
                            throw createError(400, 'BadOldPassword');
                        }

                        return Passport.updateOne(localPassport.id, { password: newPassword });
                    });
            }
        })
        .then(() => res.json({ id: id }))
        .catch(res.sendError);
}

function updateEmail(req, res) {
    var email = req.param("email");
    var access = "self";

    if (! email
     || ! MicroService.isEmail(email)
     || req.user.email
    ) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return User.updateOne(req.user.id, { email: email });
        })
        .then(user => {
            res.json(User.expose(user, access));
        })
        .catch(res.sendError);
}

// only update the phone if SMS feature is disabled
async function updatePhone(req, res) {
    const { phone } = req.allParams();
    const access = 'self';

    if (!phone) {
        return res.badRequest();
    }

    try {
        const user = await User.updateOne(req.user.id, { phone, phoneCheck: false });
        res.json(User.expose(user, access));
    } catch (err) {
        res.sendError(err);
    }
}

function lostPassword(req, res) {
    var email = req.param("email");

    return Promise
        .resolve()
        .then(() => {
            return [
                User.findOne({
                    email: email,
                    destroyed: false
                }),
                GeneratorService.getRandomString(30)
            ];
        })
        .spread((user, tokenValue) => {
            // handle as an email is sent (for security issue)
            if (! user) {
                return;
            }

            return createLocalPassportIfNone(user)
                .then(() => {
                    return sendEmail(user, tokenValue);
                });
        })
        .then(() => res.sendStatus(200))
        .catch(res.sendError);



    function sendEmail(user, tokenValue) {
        return Promise
            .resolve()
            .then(() => {
                var createAttrs = {
                    type: "lostPassword",
                    value: tokenValue,
                    userId: user.id,
                    expirationDate: moment().add(1, "h").toISOString()
                };

                return Token.create(createAttrs);
            })
            .then(token => {
                return EmailTemplateService.sendEmailTemplate('password_recovery', {
                    user,
                    data: {
                        token,
                    },
                });
            });
    }

    function createLocalPassportIfNone(user) {
        return Promise
            .resolve()
            .then(() => {
                return Passport.findOne({
                    user: user.id,
                    protocol: "local"
                });
            })
            .then(passport => {
                if (passport) {
                    return passport;
                }

                return Passport.create({
                    protocol: "local",
                    user: user.id
                });
            });
    }
}

function recoveryPassword(req, res) {
    var tokenId    = req.param("tokenId");
    var tokenValue = req.param("tokenValue");
    var password   = req.param("password");

    var now = moment().toISOString();

    if (! tokenId
     || ! tokenValue
    ) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Token.findOne({
                id: tokenId,
                value: tokenValue
            });
        })
        .then(token => {
            if (! token) {
                throw createError(404);
            } else if (token.usedDate) {
                throw createError(400, 'TokenUsed');
            } else if (token.expirationDate < now) {
                throw createError(400, 'TokenExpired');
            }

            // if no password provided, only check the validity of the token
            if (password) {
                return updatePassword(token, password);
            } else {
                return;
            }
        })
        .then(() => res.sendStatus(200))
        .catch(res.sendError);



    function updatePassword(token, password) {
        return Promise
            .resolve()
            .then(() => {
                return Token.updateOne(token.id, { usedDate: now });
            })
            .then(token => {
                return Passport.updateOne(
                    {
                        user: token.userId,
                        protocol: "local"
                    },
                    { password: password }
                );
            });
    }
}

function emailNew(req, res) {
    var email = req.param("email");

    if (! email || ! MicroService.isEmail(email)) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return User.findOne({
                email: email,
                id: { '!=': req.user.id }
            });
        })
        .then(user => {
            if (user) {
                throw createError(400, 'Existing email');
            }

            return User.createCheckEmailToken(req.user, email);
        })
        .then(token => {
            return EmailTemplateService
                .sendEmailTemplate('email_confirmation', {
                    user: req.user,
                    data: {
                        email,
                        token,
                    },
                })
                .catch(err => {
                    req.logger.error({ err: err }, "send email sendCheckEmailToConfirm");
                });
        })
        .then(() => res.sendStatus(200))
        .catch(res.sendError);
}

function emailCheck(req, res) {
    var email      = req.param("email");
    var tokenId    = req.param("tokenId");
    var tokenValue = req.param("tokenValue");
    var firstTime  = req.param("firstTime");

    // TODO: remove the old way after all users pass to the new way
    if (email && tokenValue) {
        return oldWay();
    } else if (tokenId && tokenValue) {
        return newWay();
    } else {
        res.badRequest();
    }



    function oldWay() {
        return Promise
            .resolve()
            .then(() => {
                return User.findOne({
                    email: email,
                    emailToken: tokenValue
                });
            })
            .then(user => {
                if (! user) {
                    throw createError(404);
                }

                if (! user.emailCheck) {
                    return User.updateOne(user.id, { emailCheck: true })
                        .then(user => {
                            GamificationService.checkActions(user, ["EMAIL_VALIDATION"], null, req.logger, req);

                            return EmailTemplateService
                                .sendEmailTemplate('subscription', { user })
                                .catch(err => {
                                    req.logger.error({ err: err }, "send email appSubscriptionConfirmed");
                                });
                        });
                }
            })
            .then(() => res.sendStatus(200))
            .catch(res.sendError);
    }

    function newWay() {
        return Promise
            .resolve()
            .then(() => {
                return Token.findOne({
                    id: tokenId,
                    value: tokenValue,
                    type: "EMAIL_CHECK"
                });
            })
            .then(token => {
                if (! token) {
                    throw createError(404);
                }

                return [
                    token,
                    User.findOne({ id: token.userId })
                ];
            })
            .spread((token, user) => {
                if (! user) {
                    throw createError(404);
                }

                return [
                    User.updateOne(user.id, {
                        emailCheck: true,
                        email: token.reference.email
                    }),
                    ! token.usedDate ? Token.updateOne(token.id, { usedDate: moment().toISOString() }) : null
                ];
            })
            .spread((user, token) => {
                GamificationService.checkActions(user, ["EMAIL_VALIDATION"], null, req.logger, req);

                // send email only if it's the first time (at the register time, not when changing email) and if the token isn't used
                if (firstTime && token) {
                    return EmailTemplateService
                        .sendEmailTemplate('subscription', { user })
                        .catch(err => {
                            req.logger.error({ err: err }, "send email appSubscriptionConfirmed");
                        });
                }
            })
            .then(() => res.sendStatus(200))
            .catch(res.sendError);
    }
}

function updateMedia(req, res) {
    var id = req.param("id");
    var mediaId = req.param("mediaId");

    if (req.user.id !== parseInt(id, 10)) {
        return res.forbidden();
    }

    return Promise
        .resolve()
        .then(() => {
            return isValidMediaId(mediaId);
        })
        .then(() => {
            return User.updateOne(req.user.id, { mediaId: mediaId });
        })
        .then(user => {
            GamificationService.checkActions(user, ["ADD_PROFILE_IMAGE"], null, req.logger, req);

            res.json({ id });
        })
        .catch(res.sendError);



    function isValidMediaId(mediaId) {
        if (typeof mediaId === "undefined" || mediaId === null) {
            return;
        }

        return Media
            .findOne({ id: mediaId })
            .then(media => {
                if (! media) {
                    throw createError(404);
                }
                if (req.user.id !== media.userId) {
                    throw createError(403);
                }

                return media;
            });
    }
}

function unsubscribeLink(req, res) {
    var email      = req.param("e");
    var emailToken = req.param("t");

    var viewAttrs = {
        layout: "layouts/nothing",
        title: "Désinscription"
    };

    if (! email || ! emailToken) {
        viewAttrs.badParams = true;
        return res.view(viewAttrs);
    }

    return Promise.coroutine(function* () {
        var user = yield User.findOne({
            email: email,
            emailToken: emailToken
        });

        if (! user) {
            viewAttrs.badParams = true;
        } else {
            yield sendStelaceEvent(req, res, user.id);
            yield User.updateOne(user.id, { newsletter: false });
        }
    })()
    .catch(err => {
        req.logger.warn({
            err: err,
            email: email
        }, "Fail to unsubscribe");

        viewAttrs.serverError = true;
    })
    .finally(() => {
        res.view(viewAttrs);
    });



    function sendStelaceEvent(req, res, userId) {
        return StelaceEventService.createEvent({
            req: req,
            res: res,
            defaultUserId: userId,
            label: "newsletter.unsubscribed",
            type: 'core',
        });
    }
}

function applyFreeFees(req, res) {
    var access = "self";

    return Promise.coroutine(function* () {
        var canApply = User.canApplyFreeFees(req.user);

        if (! canApply.result) {
            throw createError('Cannot apply no fees');
        }

        var user = yield User.applyFreeFees(req.user);

        return res.json(User.expose(user, access));
    })()
    .catch(res.sendError);
}

function getIncomeReport(req, res) {
    return Promise.coroutine(function* () {
        var reportActive = yield StelaceConfigService.isFeatureActive('INCOME_REPORT');
        if (!reportActive) {
            throw createError(403, 'Income report disabled');
        }

        var report = yield IncomeReportService.getReportData(req.user);

        var years = _.keys(report);

        if (years.length) {
            yield Promise.map(years, year => {
                return TokenService.getIncomeReportToken(req.user.id, year, { M: 1 }, { d: 21 })
                    .then(token => {
                        report[year].token = token.value;
                    });
            });
        }

        res.json(report);
    })()
    .catch(res.sendError);
}

function getIncomeReportPdf(req, res) {
    var id         = req.param("id");
    var year       = req.param("year");
    var tokenValue = req.param("t");

    if (! tokenValue) {
        return sendErrorView(createError(403));
    }

    year = parseInt(year, 10);

    return Promise.coroutine(function* () {
        const getToken = async () => {
            const [token] = await Token
                .find({
                    type: TokenService.getIncomeReportTokenName(year),
                    value: tokenValue,
                })
                .limit(1);

            return token;
        };

        var results = yield Promise.props({
            user: User.findOne({ id: id }),
            token: getToken(),
        });

        var user  = results.user;
        var token = results.token;

        if (! user) {
            throw createError(404);
        }
        if (! token) {
            throw createError(403);
        }
        if (token.expirationDate < moment().toISOString()) {
            throw createError(403, 'Token expired');
        }

        var filepath = yield IncomeReportService.getReportFilepath(user, year);

        yield sendStelaceEvent(req, res, id, year);

        var filename = IncomeReportService.getReportName(year);
        var escapedFilename = encodeURIComponent(filename);

        var headers = {
            "Content-Disposition": `inline; filename="${escapedFilename}"`,
            "X-Robots-Tag": "noindex"
        };

        res
            .set(headers)
            .sendFile(filepath, null, () => {
                fs
                    .unlinkAsync(filepath)
                    .catch(() => { return; });
            });
    })()
    .catch(err => sendErrorView(err));



    function sendStelaceEvent(req, res, userId, year) {
        var config = {
            req: req,
            res: res,
            label: "Tax statement view",
            defaultUserId: userId,
            data: { year: year }
        };

        return StelaceEventService.createEvent(config);
    }

    function sendErrorView(err) {
        var body = "";

        if (err.message === "token expired") {
            body += "L'URL du récapitulatif des revenus a expiré. Vous allez être redirigé dans quelques instants...";
            body += getRedirectURLScript("/home");

            res.send(200, getHtml(body));
        } else if (err.status === 403) {
            body += "L'URL du récapitulatif des revenus est incorrecte. Vous allez être redirigé dans quelques instants...";
            body += getRedirectURLScript("/");

            res.send(403, getHtml(body));
        } else {
            req.logger.error({
                err: err,
                userId: id
            }, "Income report fail");

            body += "Une erreur est survenue. Veuillez réessayer plus tard.<br>";
            body += "Vous allez être redirigé dans quelques instants...";
            body += getRedirectURLScript("/");

            res.send(505, getHtml(body));
        }
    }

    function getHtml(body) {
        return `
            <!DOCTYPE html>
            <html lang="fr">
                <head>
                    <title>Récapitulatif des revenus</title>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                    <meta name="robots" content="noindex">
                </head>

                <body>
                    ${body}
                </body>
            </html>
        `;
    }

    function getRedirectURLScript(url, timeout) {
        timeout = timeout || 5000;

        return `
            <script>
                setTimeout(function () { window.location.replace("${url}") }, ${timeout});
            </script>
        `;
    }
}

async function getPaymentAccounts(req, res) {
    const mangopayUserId = User.getMangopayUserId(req.user);
    const mangopayWalletId = User.getMangopayWalletId(req.user);
    const stripeCustomerId = User.getStripeCustomerId(req.user);
    const stripeAccountId = User.getStripeAccountId(req.user);

    res.json({
        mangopayAccount: !!mangopayUserId,
        mangopayWallet: !!mangopayWalletId,
        stripeCustomer: !!stripeCustomerId,
        stripeAccount: !!stripeAccountId,
    });
}
