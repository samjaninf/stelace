/* global mangopay, TimeService */

const {
    Transaction,
    TransactionLog,
} = require('../models_new');

/**
 * TransactionLogController
 *
 * @description :: Server-side logic for managing transactionlogs
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    webhook: webhook

};

function webhook(req, res) {
    var resourceId = req.param("RessourceId");
    var date       = req.param("Date");
    var eventType  = req.param("EventType");

    var eventDate = new Date(parseInt(date + "000", 10));

    if (! resourceId
     || ! date || isNaN(eventDate.getTime())
     || ! eventType
    ) {
        return res.badRequest();
    }

    var createAttrs = {
        resourceId: resourceId,
        eventDate: eventDate.toISOString(),
        eventType: eventType
    };

    return Promise.coroutine(function* () {
        var transactionLog = yield TransactionLog.create(createAttrs);

        if (transactionLog.eventType === "PAYOUT_NORMAL_SUCCEEDED") {
            var payout = yield mangopay.payout.fetch({ payoutId: transactionLog.resourceId });
            yield Transaction.update({ resourceId: payout.Id }, {
                executionDate: TimeService.convertTimestampSecToISO(payout.ExecutionDate)
            });
        }
    })()
    .then(() => res.ok())
    .catch(err => {
        req.logger.error({ err: err }, "Mangopay webhook, fail creating TransactionLog");
        res.serverError(err);
    });
}
