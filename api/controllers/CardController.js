/* global Card, PaymentMangopayService, PaymentStripeService, StelaceConfigService */

/**
 * CardController
 *
 * @description :: Server-side logic for managing cards
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    find,
    findOne,
    create,
    update,
    destroy,

    my,
    createCardRegistration,

};

const createError = require('http-errors');

function find(req, res) {
    return res.forbidden();
}

function findOne(req, res) {
    return res.forbidden();
}

async function create(req, res) {
    const {
        cardRegistrationId,
        registrationData,
        cardToken,
        forget,
        paymentProvider,
    } = req.allParams();

    const access = 'self';

    let card;

    if (paymentProvider === 'mangopay') {
        if (!cardRegistrationId
         || !registrationData
        ) {
            throw createError(400);
        }

        const cardRegistration = await PaymentMangopayService.updateCardRegistration({
            cardRegistrationId,
            registrationData,
        });

        const errorType = PaymentMangopayService.getErrorType(cardRegistration.ResultCode);
        if (errorType) {
            throw createError(400, { errorType });
        }

        card = await PaymentMangopayService.createCard({
            userId: req.user.id,
            providerCardId: cardRegistration.CardId,
            forget,
        });
    } else if (paymentProvider === 'stripe') {
        if (!cardToken) {
            throw createError(400);
        }

        try {
            card = await PaymentStripeService.createCard({
                user: req.user,
                sourceId: cardToken,
                forget,
            });
        } catch (err) {
            const errorType = PaymentStripeService.getErrorType(err);
            throw createError(400, { errorType });
        }
    } else {
        throw new Error('Unknown payment provider');
    }

    res.json(Card.expose(card, access));
}

function update(req, res) {
    return res.forbidden();
}

async function destroy(req, res) {
    const id = req.param('id');

    const card = await Card.findOne({ id });
    if (!card) {
        throw createError(404);
    }
    if (card.userId !== req.user.id) {
        throw createError(403);
    }

    await Card.updateOne(card.id, { forget: true });

    res.json({ id });
}

async function my(req, res) {
    const access = 'self';

    const cards = await Card.fetchCards(req.user);
    res.json(Card.exposeAll(cards, access));
}

async function createCardRegistration(req, res) {
    const cardType = req.param('cardType');
    let currency = req.param('currency');

    if (!currency) {
        const config = await StelaceConfigService.getConfig();
        currency = config.currency;

        if (!currency) {
            if (sails.config.stelace.stelaceId && !config.is_service_live) {
                currency = StelaceConfigService.getDefaultCurrency();
            } else {
                throw new Error('Missing payment configuration');
            }
        }
    }

    const cardRegistration = await PaymentMangopayService.createCardRegistration(req.user, {
        currency,
        cardType,
    });

    const result = {
        id: cardRegistration.Id,
        cardRegistrationURL: cardRegistration.CardRegistrationURL,
        preregistrationData: cardRegistration.PreregistrationData,
        accessKey: cardRegistration.AccessKey,
        cardType: cardRegistration.CardType,
        resultCode: cardRegistration.ResultCode,
    };

    res.json(result);
}
