/* global ListingTypeService */

/**
 * ListingTypeController
 *
 * @description :: Server-side logic for managing listingtypes
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    find,

};

async function find(req, res) {
    try {
        const listingTypes = await ListingTypeService.getListingTypes();
        res.json(listingTypes);
    } catch (err) {
        res.sendError(err);
    }
}
