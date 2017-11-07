/* global RatingService */

const {
    Rating,
} = require('../models_new');

/**
 * RatingController
 *
 * @description :: Server-side logic for managing ratings
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {

    find: find,
    create: create,
    update: update,

};

var moment = require('moment');

async function find(req, res) {
    let {
        bookingId,
        targetId,
        populateListings,
    } = req.allParams();

    try {
        const ratings = await RatingService.findRatings({
            bookingId,
            targetId,
            populateListings,
            user: req.user,
            access: 'others',
        });

        res.json(ratings);
    } catch (err) {
        res.sendError(err);
    }
}

async function create(req, res) {
    const access = 'self';
    const attrs = req.allParams();

    if (typeof attrs.score !== 'undefined') {
        attrs.score = parseInt(attrs.score, 10);
    }

    const now = moment().toISOString();

    try {
        let classifiedRatings = await RatingService.createRating({
            attrs,
            user: req.user,
            logger: req.logger,
            req,
        });

        classifiedRatings = Rating.exposeClassifiedRatings(classifiedRatings, now);
        res.json(Rating.expose(classifiedRatings.my, access));
    } catch (err) {
        res.sendError(err);
    }
}

async function update(req, res) {
    const id = req.param('id');
    const attrs = req.allParams();
    const access = 'self';

    if (typeof attrs.score !== 'undefined') {
        attrs.score = parseInt(attrs.score, 10);
    }

    const now = moment().toISOString();

    try {
        let classifiedRatings = await RatingService.updateRating(id, {
            attrs,
            user: req.user,
            logger: req.logger,
            req,
        });

        classifiedRatings = Rating.exposeClassifiedRatings(classifiedRatings, now);
        res.json(Rating.expose(classifiedRatings.my, access));
    } catch (err) {
        res.sendError(err);
    }
}
