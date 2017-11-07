const {
    ApiKey,
    Webhook,
} = require('../../models_new');

module.exports = {

    create,
    destroy,

};

async function create(req, res) {
    const key = req.param('key');

    if (!key) {
        return res.badRequest();
    }

    try {
        await ApiKey.create({ key });
        res.ok();
    } catch (err) {
        res.sendError(err);
    }
}

async function destroy(req, res) {
    const key = req.param('key');

    if (!key) {
        return res.badRequest();
    }

    try {
        const apiKey = await ApiKey.findOne({ key });

        if (apiKey) {
            await Webhook.remove({ apiKeyId: apiKey.id });
            await ApiKey.remove({ key });
        }

        res.ok();
    } catch (err) {
        res.sendError(err);
    }
}
