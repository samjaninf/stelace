/* global AppUrlService, ContentEntriesService, CurrencyService, EmailService, EmailHelperService, StelaceConfigService */

module.exports = {

    sendGeneralNotificationEmail,
    sendEmailTemplate,

    getListTemplates,
    getTemplateResult,
    getTemplateWorkflow,

    getParametersMetadata,
    getExampleData,

};

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const formatMessage = require('format-message');
const Handlebars = require('handlebars');
const cheerio = require('cheerio');

Promise.promisifyAll(fs);

const general = {
    filteredFields: [
        "mainTitle",
        "trailingContact",
        "previewContent",
        "leadingContent",
        "notificationImageAlt",
        "notificationImageUrl",
        "notificationImageHref",
        "notificationImageWidth",
        "notificationImageMaxWidth",
        "notificationImageCustomStyles",
        "content",
        "ctaButtonText",
        "ctaUrl",
        "trailingContent",
        "featured",
        "featuredImageUrl",
        "featuredImageAlt",
        "featuredImageHref",
        "featuredTitle",
        "featuredContent",
        "postFeaturedContent",
        "customGoodbye",
        "noSocialBlock",
        "footerContent"
    ],
    userFields: [
        "id",
        "firstname",
        "email"
    ],
    notificationFields: [
        "notificationImageAlt",
        "notificationImageUrl",
        "notificationImageHref",
        "notificationImageWidth",
        "notificationImageMaxWidth",
        "notificationImageCustomStyles"
    ],
    featuredFields: [
        "featured",
        "featuredImageUrl",
        "featuredImageAlt",
        "featuredImageHref",
        "featuredTitle",
        "featuredContent"
    ]
};

let emailTemplate;
let emailCompiledTemplate;

/**
 * send general notification email
 * @param {object}   args
 * @param {object}   args.user                          user or email must be required
 * @param {string}   args.email                         user or email must be required
 * @param {string[]} args.templateTags                  email tagging
 * @param {string}   [args.mainTitle]                   can be HTML
 * @param {string}   [args.specificTemplateName]        useful to differentiate from other general template use
 * @param {string}   [args.replyTo]                     Reply-To email header
 * @param {string}   args.subject                       email subject
 * @param {string}   [args.previewContent]              preview for mobile email client
 * @param {string}   [args.leadingContent]              can be HTML
 * @param {string}   [args.notificationImageUrl]        image source
 * @param {string}   [args.notificationImageAlt]        image alt
 * @param {string}   [args.notificationImageHref]       image link
 * @param {string}   [args.notificationImageWidth]      image width (required if notificationImageUrl is defined)
 * @param {string}   [args.notificationImageMaxWidth]   image max width (required if notificationImageUrl is defined)
 * @param {string}   [args.content]                     can be HTML
 * @param {string}   [args.ctaButtonText]               button call to action
 * @param {string}   [args.ctaUrl]                      button link (required if ctaButtonText is defined)
 * @param {string}   [args.trailingContent]             can be HTML
 * @param {boolean}  [args.featured = false]            enable feature section
 * @param {string}   [args.featuredImageUrl]            feature image source
 * @param {string}   [args.featuredImageAlt]            feature image alt
 * @param {string}   [args.featuredImageHref]           feature image link
 * @param {string}   [args.featuredTitle]               feature title
 * @param {string}   [args.featuredContent]             can be HTML
 * @param {string}   [args.customGoodBye]               can be HTML
 * @param {boolean}  [args.noSocialBlock = false]       display social icons
 * @param {string}   [args.footerContent]               can be HTML
 * @param {boolean}  [args.noCopyEmail]                 force no copy of this email
 * @param {boolean}  [args.transactional]               is transaction email (false for newsletter)
 */
function sendGeneralNotificationEmail(args) {
    args = args || {};
    const templateTags  = args.templateTags || [];
    const user          = args.user;
    const email         = args.email;
    const replyTo       = args.replyTo;
    const noCopyEmail   = args.noCopyEmail;
    const transactional = args.transactional;
    let subject         = args.subject;

    let data = _.pick(args, general.filteredFields);
    data = omitUnusedFields(data);

    data = _.reduce(data, (memo, value, key) => {
        memo[key] = EmailHelperService.minifyHtml(value);
        return memo;
    }, {});

    subject = EmailHelperService.minifyHtml(subject);

    return EmailService
        .sendEmail({
            templateName: "general-notification-template",
            specificTemplateName: args.specificTemplateName || "general-notification-template",
            toUser: _.pick(user, general.userFields),
            toEmail: email,
            replyTo: replyTo,
            subject: subject,
            data: data,
            tags: templateTags,
            noCopyEmail: noCopyEmail,
            transactional: transactional,
        });
}

function omitUnusedFields(data) {
    let omitFields = [];

    if (! data.notificationImageUrl) {
        omitFields = omitFields.concat(general.notificationFields);
    }
    if (! data.featured) {
        omitFields = omitFields.concat(general.featuredFields);
    }

    if (! omitFields.length) {
        return data;
    } else {
        return _.omit(data, omitFields);
    }
}

async function sendEmailTemplate(/* templateName, args */) {
    // TODO: replace with real templates
    await Promise.resolve();
}

async function getTemplateResult(templateName, { lang, user, isEditMode, data = {} }) {
    const config = await StelaceConfigService.getConfig();

    const emailTemplate = await fetchEmailTemplate();
    const rawContent = await getTemplateContent(templateName, lang);
    const workflow = getTemplateWorkflow(templateName);

    // transform input data into ICU placeholders
    let parameters = {};
    parameters = await beforeTransformData(parameters, { config, data, user, lang });
    if (typeof workflow.transformData === 'function') {
        const templateParameters = await workflow.transformData(parameters, { config, data, user, lang });
        if (templateParameters) {
            parameters = templateParameters;
        }
    }

    // compile user content using ICU placeholders into HBS variables
    let compiledContent = compileContent(rawContent, parameters, { lang, currency: config.currency });

    // add HBS variables that are not editable by user
    compiledContent = beforeCompileNonEditableContent(compiledContent, { config, data, user, lang });
    if (typeof workflow.compileNonEditableContent === 'function') {
        const templateCompiledContent = workflow.compileNonEditableContent(compiledContent, { config, data, user, lang });
        if (templateCompiledContent) {
            compiledContent = templateCompiledContent;
        }
    }

    // get allowed blocks
    let emailTemplateBlocks = getEmailBlocks();
    if (typeof workflow.getEmailBlocks === 'function') {
        emailTemplateBlocks = Object.assign({}, emailTemplateBlocks, workflow.getEmailBlocks() || {});
    }

    // enable or disable email blocks based on preview
    compiledContent = computeContentBlock(compiledContent, { emailTemplateBlocks, isEditMode });

    let html = getHtml(emailTemplate, compiledContent);

    const $ = cheerio.load(html);
    if (isEditMode) {
        $('[data-translate]').each((i, el) => {
            const $el = $(el);
            const translationKey = $el.attr('data-translate');
            if (translationKey.startsWith('_template')) {
                const newTranslationKey = translationKey.replace('_template', `template.${templateName}`);
                $el.attr('data-translate', newTranslationKey);
            }
        });
        html = $.html();
    } else {
        $('[data-translate]').each((i, el) => {
            const $el = $(el);
            $el.removeAttr('data-translate');
        });
        html = $.html();
    }

    return {
        html,
        subject: compiledContent.subject,
        parameters,
    };
}

async function fetchEmailTemplate() {
    if (emailTemplate && sails.config.environment !== 'development') {
        return emailTemplate;
    }

    const emailFilepath = path.join(__dirname, '../assets/emailsTemplates/general.html');
    emailTemplate = await fs.readFileAsync(emailFilepath, 'utf8');

    return emailTemplate;
}

async function getTemplateContent(templateName, lang) {
    const rawContent = await ContentEntriesService.getTranslations({ lang, namespace: 'email' });

    return Object.assign({}, rawContent.general, rawContent.template[templateName]);
}

function configureFormatMessage(formatMessage, { lang, currency = 'EUR' }) {
    let customFormats = {};

    if (currency) {
        const currencyDecimal = CurrencyService.getCurrencyDecimal(currency);

        customFormats.number = {
            currency: {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: currencyDecimal,
            },
        };
    }

    customFormats.date = {
        fullmonth: {
            month: 'long',
            year: 'numeric',
        },
    };

    formatMessage.setup({
        locale: lang,
        formats: Object.keys(customFormats).length ? customFormats : undefined,
    });
}

function compileContent(rawContent, parameters, { lang, currency }) {
    const compiledContent = {};

    configureFormatMessage(formatMessage, { lang, currency });

    Object.keys(rawContent).forEach(key => {
        const value = rawContent[key];
        compiledContent[key] = formatMessage(value, parameters);
    });

    return compiledContent;
}

function beforeCompileNonEditableContent(content, { config, /*data, user, lang*/ }) {
    const newContent = {};

    if (config.logo__url) {
        newContent.service_logo__url = sails.config.stelace.url + config.logo__url;
    }

    return Object.assign({}, content, newContent);
}

function computeContentBlock(content, { emailTemplateBlocks, isEditMode }) {
    const newContent = {};

    const blockNames = [
        'trailing_contact__block',
        'service_logo__block',
        'main_title__block',
        'leading_content__block',
        'notification_image__block',
        'cta_button__block',
        'trailing_content__block',
        'featured__block',
        'end_content__block',
        'footer_content__block',
        'custom_goodbye__block',
    ];

    // use email blocks
    blockNames.forEach(name => {
        newContent[name] = !!emailTemplateBlocks[name];
    });

    // if not preview, hide blocks that have no value
    if (!isEditMode) {
        let computedBlock = {};

        computedBlock.trailing_contact__block = !!content.trailing_contact;
        computedBlock.service_logo__block = !!content.service_logo__url;
        computedBlock.main_title__block = !!content.main_title;
        computedBlock.leading_content__block = !!content.leading_content;
        computedBlock.notification_image__block = !!content.notification_image__href;
        computedBlock.cta_button__block = !!content.cta_button__text;
        computedBlock.trailing_content__block = !!content.trailing_content;
        computedBlock.featured__block = !!content.featured__content;
        computedBlock.end_content__block = !!content.end_content;
        computedBlock.footer_content__block = !!content.footer_content;
        computedBlock.custom_goodbye__block = !!content.custom_goodbye;

        blockNames.forEach(name => {
            if (!newContent[name]) return;
            newContent[name] = computedBlock[name];
        });
    }

    return Object.assign({}, content, newContent);
}

function getHtml(emailTemplate, content) {
    if (!emailCompiledTemplate || sails.config.environment === 'development') {
        emailCompiledTemplate = Handlebars.compile(emailTemplate);
    }

    const fields = [
        'subject',
        'preview_content',
        'trailing_contact__block',
        'trailing_contact',
        'service_logo__block',
        'service_logo__url',
        'main_title__block',
        'main_title',
        'leading_content__block',
        'leading_content',
        'notification_image__block',
        'notification_image__href',
        'notification_image__alt',
        'notification_image__width',
        'notification_image__max_width',
        'notification_image__custom_styles',
        'content',
        'cta_button__block',
        'cta__button_url',
        'cta_button__text',
        'trailing_content__block',
        'trailing_content',
        'featured__block',
        'featured__image__href',
        'featured__image__alt',
        'featured__image__url',
        'featured__title',
        'featured__content',
        'end_content__block',
        'end_content',
        'custom_goodbye__block',
        'custom_goodbye',
        'footer_content__block',
        'footer_content',
        'copyright',
    ];

    return emailCompiledTemplate(_.pick(content, fields));
}

function getEmailBlocks() {
    const commonBlocks = {
        trailing_contact__block: true,
        service_logo__block: true,
        main_title__block: true,
        leading_content__block: true,
        notification_image__block: false,
        cta_button__block: false,
        trailing_content__block: true,
        featured__block: false,
        end_content__block: true,
        footer_content__block: true,
        custom_goodbye__block: true,
    };

    return Object.assign({}, commonBlocks);
}

async function beforeTransformData(parameters, { config, user }) {
    const newParams = {};

    newParams.SERVICE_NAME = config.SERVICE_NAME;

    if (typeof user === 'object') {
        newParams.user__firstname = user.firstname || undefined;
        newParams.user__lastname = user.lastname || undefined;
    }
    newParams.current_year = '' + new Date().getFullYear();

    return Object.assign({}, parameters, newParams);
}

function getListTemplates() {
    return [
        'email_confirmation',
    ];
}

function getTemplateWorkflow(templateName) {
    let transformData;
    let getEmailBlocks;
    let compileNonEditableContent;

    if (templateName === 'email_confirmation') {
        // transformData = async function (parameters, { config, data, user, lang }) {

        // };

        getEmailBlocks = function () {
            return {
                cta_button__block: true,
            };
        };

        compileNonEditableContent = function (content, { data }) {
            const newContent = {};

            const { token } = data;

            newContent.cta__button_url = AppUrlService.getUrl('emailCheck', [token, true]);

            return Object.assign({}, content, newContent);
        };
    }

    return {
        transformData,
        getEmailBlocks,
        compileNonEditableContent,
    };
}

function getParametersMetadata(templateName) {
    const parametersMetadata = {
        email_confirmation: [
            { label: 'SERVICE_NAME', type: 'string' },
        ],
    };

    return parametersMetadata[templateName];
}

function getExampleData(templateName/*, { config }*/) {
    const exampleData = {
        email_confirmation: {
            token: {
                id: 12,
                value: 'sdf4ze89f23',
            },
        },
    };

    return exampleData[templateName];
}
