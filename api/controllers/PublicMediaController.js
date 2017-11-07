/* global StelaceEventService */

/**
 * PublicMediaController
 *
 * @description :: Server-side logic for managing publicmedias
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    mangopay: mangopay

};

var path = require('path');

function mangopay(req, res) {
    var filename = "Mangopay_Contrat_Fr_v2.pdf";
    var filepath = path.join(__dirname, "../assets/terms", filename);
    return _serveFile(req, res, filepath, filename, "Mangopay term view");
}

function _serveFile(req, res, filepath, filename, eventLabel) {
    return Promise.coroutine(function* () {
        yield StelaceEventService.createEvent({
            req: req,
            res: res,
            label: eventLabel
        });

        var headers = {
            "Cache-Control": "public, max-age=86400"
        };
        if (filename) {
            var escapedFilename = encodeURIComponent(filename);
            headers["Content-Disposition"] = `inline; filename="${escapedFilename}"`;
        }

        return res
            .set(headers)
            .sendfile(filepath);
    })();
}
