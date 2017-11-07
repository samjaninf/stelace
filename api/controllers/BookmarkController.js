/* global TimeService */

const {
    Bookmark,
    Listing,
} = require('../models_new');

/**
 * BookmarkController
 *
 * @description :: Server-side logic for managing bookmarks
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {

    create: create,
    destroy: destroy,

    destroyLink: destroyLink,
    my: my

};

function create(req, res) {
    var filteredAttrs = [
        "listingId",
        "type",
        "wishDate",
        "reference"
    ];
    var attrs = _.pick(req.allParams(), filteredAttrs);
    var access = "self";

    if (! attrs.listingId
        || ! _.contains(Bookmark.get("types"), attrs.type)
        || (attrs.wishDate && ! TimeService.isDateString(attrs.wishDate, { onlyDate: true }))
        || (attrs.reference && typeof attrs.reference !== "object")
    ) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Listing.findById(attrs.listingId);
        })
        .then(listing => {
            if (! listing) {
                throw new NotFoundError;
            }
            if (µ.isSameId(listing.ownerId, req.user.id)) {
                throw new ForbiddenError("owner can't bookmark own listings");
            }

            return Bookmark.findOne({
                listingId: listing.id,
                userId: req.user.id
            });
        })
        .then(bookmark => {
            if (bookmark) {
                attrs.active = true;
                return Bookmark.findByIdAndUpdate(bookmark.id, attrs, { new: true });
            } else {
                attrs.userId = req.user.id;
                return Bookmark.create(attrs);
            }
        })
        .then(bookmark => {
            res.json(Bookmark.expose(bookmark, access));
        })
        .catch(res.sendError);
}

function destroy(req, res) {
    var id = req.param("id");
    var token = req.param("token");

    // authentication isn't needed
    // deactivate bookmark by matching id and token

    return Bookmark
        .update(
            {
                _id: id,
                token: token
            },
            { active: false }
        )
        .then(() => res.ok({ id }))
        .catch(res.sendError);
}

function destroyLink(req, res) {
    var id = req.param("id");
    var token = req.param("t");

    // authentication isn't needed
    // deactivate bookmark by matching id and token

    return Promise
        .resolve()
        .then(() => {
            return Bookmark
                .findOneAndUpdate(
                    {
                        _id: id,
                        token: token
                    },
                    { active: false }
                );
        })
        .then(bookmark => {
            if (! bookmark) {
                res.redirect("/?destroy-bookmark=success");
            } else {
                return Listing
                    .findById(bookmark.listingId)
                    .then(listing => {
                        if (! listing) {
                            res.redirect("/?destroy-bookmark=success");
                        } else {
                            var redirectURL = sails.config.stelace.url + "/listing/" + listing.nameURLSafe + "-" + listing.id + "?destroy-bookmark=success";
                            res.redirect(redirectURL);
                        }
                    });
            }
        })
        .catch(() => {
            res.redirect("/?destroy-bookmark=fail");
        });
}

function my(req, res) {
    var access = "self";

    return Bookmark
        .find({
            userId: req.user.id,
            active: true
        })
        .then(bookmarks => {
            res.json(Bookmark.exposeAll(bookmarks, access));
        })
        .catch(res.sendError);
}
