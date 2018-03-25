/* global EmailService */

module.exports = {

    preview,
    getTemplateMetadata,

}

const fs = require('fs');
const path = require('path');

function _getTemplateMetadata() {
    const dataTypes = [
        {
            label: 'user_firstname',
            type: 'string',
        },
        {
            label: 'user_lastname',
            type: 'string',
        },
    ];

    const examples = {
        user_firstname: 'Foo',
        user_lastname: 'Bar',
    };

    return {
        dataTypes,
        examples,
    };
}

async function preview(req, res) {
    const Handlebars = EmailService.getHandlebars();

    const content = fs.readFileSync(path.join(__dirname, '../../assets/emailsTemplates/general.html'), 'utf8');
    const compiledTemplate = Handlebars.compile(content);

    const data = {
        previewContent: null,
        mainTitleBlock: true,
        mainTitle: 'Title',
        serviceLogoUrl: null,
    };

    const html = compiledTemplate(data);

    res.send(html);
}

async function getTemplateMetadata(req, res) {
    const result = _getTemplateMetadata();

    res.json(result);
}
