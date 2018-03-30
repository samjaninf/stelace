/* global ContentEntriesService, EmailTemplateService, StelaceConfigService, User */

module.exports = {

    preview,
    getTemplateMetadata,

}

const _ = require('lodash');
const createError = require('http-errors');

async function preview(req, res) {
    const { template } = req.allParams();
    let { lang } = req.allParams();

    const templates = EmailTemplateService.getListTemplates();
    if (!templates.includes(template)) {
        throw createError(404, 'Template not found');
    }
    if (lang && !ContentEntriesService.isLangAllowed(lang)) {
        throw createError(400, 'Not allowed language');
    }

    const config = await StelaceConfigService.getConfig();
    if (!lang) {
        lang = config.lang;
    }

    const workflow = EmailTemplateService.getTemplateWorkflow(template, { config });
    const exampleData = Object.keys(workflow.parametersMetadata).reduce((memo, key) => {
        const value = workflow.parametersMetadata[key];
        memo[key] = value.exampleValue;
        return memo;
    });

    let user;
    if (req.user) {
        user = req.user;
    }

    const users = await User.find().limit(100);
    user = _.first(_.shuffle(users));

    const html = await EmailTemplateService.getTemplateHTML(template, {
        lang,
        isPreview: false,
        user,
        data: exampleData,
    });

    res.send(html);
}

async function getTemplateMetadata(req, res) {
    const { template } = req.allParams();

    const templates = EmailTemplateService.getListTemplates();
    if (!templates.includes(template)) {
        throw createError(404, 'Template not found');
    }

    const workflow = EmailTemplateService.getTemplateWorkflow(template);

    res.json(workflow.parametersMetadata);
}
