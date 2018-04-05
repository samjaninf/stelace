/* global Card */

const { expect } = require('chai');

describe('Card', () => {
    describe('.parseMangopayExpirationDate()', () => {
        it('returns the expiration month and year', () => {
            const { expirationMonth, expirationYear } = Card.parseMangopayExpirationDate('0718');
            expect(expirationMonth).to.equal(7);
            expect(expirationYear).to.equal(2018);
        });
    });

    describe('.parseMangopayData()', () => {
        it('parses the mangopay raw object', () => {
            const rawCard = {
                Id: '8494514',
                UserId: '8494514',
                CreationDate: 12926321,
                Tag: 'custom meta',
                ExpirationDate: '1019',
                Alias: '497010XXXXXX4414',
                CardProvider: 'Mangopay Ltd',
                CardType: 'CB_VISA_MASTERCARD',
                Country: 'FR',
                Product: 'G',
                BankCode: '00152',
                Active: true,
                Currency: 'EUR',
                Validity: 'VALID',
                Fingerprint: '50a6a8da09654c4cab901814a741f924',
            };

            const parsedData = Card.parseMangopayData(rawCard);
            const expected = {
                paymentProvider: 'mangopay',
                resourceOwnerId: '8494514',
                resourceId: '8494514',
                expirationMonth: 10,
                expirationYear: 2019,
                currency: 'EUR',
                provider: 'Mangopay Ltd',
                type: 'CB_VISA_MASTERCARD',
                alias: '497010XXXXXX4414',
                active: true,
                validity: 'VALID',
                fingerprint: '50a6a8da09654c4cab901814a741f924',
                country: 'FR',
                data: {
                    product: 'G',
                    bankCode: '00152',
                },
            };
            expect(parsedData).to.deep.equal(expected);
        });
    });

    describe('.parseStripeTokenData()', () => {
        it('parses the stripe token raw object', () => {
            const rawJson = {
                id: 'card_1Brrj72eZvKYlo2CzrX6Na85',
                object: 'card',
                address_city: null,
                address_country: null,
                address_line1: null,
                address_line1_check: null,
                address_line2: null,
                address_state: null,
                address_zip: null,
                address_zip_check: null,
                brand: 'Visa',
                country: 'US',
                customer: 'cus_CGMd3eZanFamae',
                cvc_check: null,
                dynamic_last4: null,
                exp_month: 8,
                exp_year: 2019,
                fingerprint: 'Xt5EWLLDS7FJjR1c',
                funding: 'credit',
                last4: '4242',
                metadata: {
                },
                name: null,
                tokenization_method: null
            };

            const parsedData = Card.parseStripeTokenData(rawJson);
            const expected = {
                paymentProvider: 'stripe',
                resourceOwnerId: 'cus_CGMd3eZanFamae',
                resourceId: 'card_1Brrj72eZvKYlo2CzrX6Na85',
                expirationMonth: 8,
                expirationYear: 2019,
                currency: null,
                provider: null,
                type: 'Visa',
                alias: '4242',
                active: true,
                validity: null,
                fingerprint: 'Xt5EWLLDS7FJjR1c',
                country: 'US',
                data: {
                    ownerName: null,
                    funding: 'credit',
                    address_city: null,
                    address_country: null,
                    address_line1: null,
                    address_line1_check: null,
                    address_line2: null,
                    address_state: null,
                    address_zip: null,
                    address_zip_check: null,
                },
            };
            expect(parsedData).to.deep.equal(expected);
        });
    });

    describe('.parseStripeSourceData()', () => {
        it('parses the stripe source raw object', () => {
            const rawJson = {
                id: 'src_1CDa4zD1n4vDro1gFJh3Vy9m',
                object: 'source',
                amount: null,
                client_secret: 'src_client_secret_Ccpkcv8q30PygtV9whLEqVUa',
                created: 1522942369,
                currency: null,
                customer: 'cus_CcpRNohufSgalT',
                flow: 'none',
                livemode: false,
                metadata: {},
                owner: {
                    address: {
                        city: null,
                        country: null,
                        line1: null,
                        line2: null,
                        postal_code: '46789',
                        state: null,
                    },
                    email: null,
                    name: null,
                    phone: null,
                    verified_address: null,
                    verified_email: null,
                    verified_name: null,
                    verified_phone: null,
                },
                statement_descriptor: null,
                status: 'chargeable',
                type: 'card',
                usage: 'reusable',
                card: {
                    exp_month: 4,
                    exp_year: 2024,
                    address_zip_check: 'pass',
                    brand: 'Visa',
                    card_automatically_updated: false,
                    country: 'US',
                    cvc_check: 'pass',
                    fingerprint: '6fd31TMkReoFB5vt',
                    funding: 'credit',
                    last4: '4242',
                    three_d_secure: 'optional',
                    address_line1_check: null,
                    tokenization_method: null,
                    dynamic_last4: null,
                },
            };

            const parsedData = Card.parseStripeSourceData(rawJson);
            const expected = {
                paymentProvider: 'stripe',
                resourceOwnerId: 'cus_CcpRNohufSgalT',
                resourceId: 'src_1CDa4zD1n4vDro1gFJh3Vy9m',
                expirationMonth: 4,
                expirationYear: 2024,
                currency: null,
                provider: null,
                type: 'Visa',
                alias: '4242',
                active: true,
                validity: null,
                fingerprint: '6fd31TMkReoFB5vt',
                country: 'US',
                data: {
                    ownerName: null,
                    funding: 'credit',
                    address_city: null,
                    address_country: null,
                    address_zip: '46789',
                    address_line1: null,
                    address_line2: null,
                    address_state: null,
                    threeDSecure: 'optional',
                    sourceId: 'src_1CDa4zD1n4vDro1gFJh3Vy9m',
                    sourceStatus: 'chargeable',
                    sourceUsage: 'reusable',
                },
            };
            expect(parsedData).to.deep.equal(expected);
        });
    });
});
