import nodeFetch from 'node-fetch';
const fetchFn = typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : nodeFetch;

let FastXMLBuilder;
let FastXMLParser;
if (globalThis.__FAST_XML_PARSER_LIB__) {
    FastXMLBuilder = globalThis.__FAST_XML_PARSER_LIB__.XMLBuilder;
    FastXMLParser = globalThis.__FAST_XML_PARSER_LIB__.XMLParser;
} else {
    const fastXml = await import('fast-xml-parser');
    FastXMLBuilder = fastXml.XMLBuilder;
    FastXMLParser = fastXml.XMLParser;
    globalThis.__FAST_XML_PARSER_LIB__ = fastXml;
}

const isValidCardNumber = globalThis.__PAYMENT_IS_VALID_CARD_NUMBER__ || function(cardNumber) {
    const cleaned = cardNumber.replace(/\s/g, '').replace(/\D/g, '');
    if (cleaned.length < 13 || cleaned.length > 19) return false;
    let sum = 0, isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
        let digit = parseInt(cleaned[i]);
        if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
        sum += digit; isEven = !isEven;
    }
    return sum % 10 === 0;
};
globalThis.__PAYMENT_IS_VALID_CARD_NUMBER__ = isValidCardNumber;

const isValidExpDate = globalThis.__PAYMENT_IS_VALID_EXP_DATE__ || function(expDate) {
    const regex = /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/;
    if (!regex.test(expDate)) return false;
    const [m, y] = expDate.split('/');
    const fy = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const cy = new Date().getFullYear();
    const cm = new Date().getMonth() + 1;
    if (fy < cy || (fy === cy && parseInt(m) < cm)) return false;
    return true;
};
globalThis.__PAYMENT_IS_VALID_EXP_DATE__ = isValidExpDate;

const isValidCVV = globalThis.__PAYMENT_IS_VALID_CVV__ || function(cvv) {
    return /^\d{3,4}$/.test(cvv);
};
globalThis.__PAYMENT_IS_VALID_CVV__ = isValidCVV;

export default async function paymentHandler(req, res) {
    const bypassToken = req.headers['x-vercel-protection-bypass'];
    const expectedBypassToken = process.env.VERCEL_PROTECTION_BYPASS;
    if (expectedBypassToken && bypassToken !== expectedBypassToken) {
        return res.status(401).json({ error: 'Unauthorized - Invalid bypass token' });
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            cardNumber,
            expDate,
            cardCode,
            firstName,
            lastName,
            companyName,
            address1,
            address2,
            city,
            state,
            zip,
            country,
            email,
            secondaryEmail,
            amount,
            lineItems = [],
            subscriptionItems = [],
            oneTimeLineItems = [],
            subscriptionMonthlyTotal,
            billingFirstName,
            billingLastName,
            billingCompany,
            billingAddress1,
            billingAddress2,
            billingCity,
            billingState,
            billingZip,
            billingCountry
        } = req.body;

        if (!cardNumber || !expDate || !cardCode ||
            amount === undefined || amount === null || amount === '' ||
            !firstName || !lastName || !address1 || !city || !state || !zip || !email) {
            return res.status(400).json({ success: false, error: 'Missing required payment or customer information.' });
        }

        const isProduction = process.env.NODE_ENV === 'production' || process.env.AUTHORIZE_NET_ENVIRONMENT === 'production';

        const loginId = isProduction ? process.env.AUTHORIZE_NET_LOGIN_ID_PROD : process.env.AUTHORIZE_NET_LOGIN_ID;
        const transactionKey = isProduction ? process.env.AUTHORIZE_NET_TRANSACTION_KEY_PROD : process.env.AUTHORIZE_NET_TRANSACTION_KEY;

        console.log('Payment processing environment:', isProduction ? 'PRODUCTION' : 'SANDBOX');
        console.log('Using Login ID:', loginId ? loginId.substring(0, 4) + '****' : 'MISSING');

        if (!loginId || !transactionKey) {
            return res.status(500).json({
                success: false,
                error: `Authorize.net ${isProduction ? 'production' : 'sandbox'} credentials not configured.`
            });
        }

        if (isProduction) {
            if (!isValidCardNumber(cardNumber)) {
                return res.status(400).json({ success: false, error: 'Invalid card number format.' });
            }
            if (!isValidExpDate(expDate)) {
                return res.status(400).json({ success: false, error: 'Invalid expiration date format.' });
            }
            if (!isValidCVV(cardCode)) {
                return res.status(400).json({ success: false, error: 'Invalid CVV format.' });
            }
        }

        const [month, yearPart] = expDate.split('/');
        const fullYear = yearPart.length === 2 ? '20' + yearPart : yearPart;
        const expirationDate = `${fullYear}-${month.padStart(2, '0')}`;

        let customerId = null;
        if (email) {
            const localPart = (email.split('@')[0] || '').replace(/[^a-zA-Z0-9]/g, '');
            if (localPart) {
                customerId = localPart.slice(0, 20);
            }
        }

        const billFirstName = billingFirstName || firstName;
        const billLastName = billingLastName || lastName;
        const billCompany = billingCompany || companyName || '';
        const billAddressLine1 = billingAddress1 || address1 || '';
        const billAddressLine2 = billingAddress2 || address2 || '';
        const billCity = billingCity || city || '';
        const billState = billingState || state || '';
        const billZip = billingZip || zip || '';
        const billCountryValue = billingCountry || country || 'US';
        const combinedBillAddress = [billAddressLine1, billAddressLine2].filter(Boolean).join(' ');

        const builder = new FastXMLBuilder({ ignoreAttributes: false });
        const authorizeNetUrl = isProduction
            ? 'https://api.authorize.net/xml/v1/request.api'
            : 'https://apitest.authorize.net/xml/v1/request.api';

        const requestedLineItems = Array.isArray(lineItems) ? lineItems : [];
        const requestedSubscriptionItems = Array.isArray(subscriptionItems) ? subscriptionItems : [];
        const providedOneTimeLineItems = Array.isArray(oneTimeLineItems) ? oneTimeLineItems : [];

        const chargeLineItems = (providedOneTimeLineItems.length > 0 ? providedOneTimeLineItems : requestedLineItems)
            .filter(item => !item?.isSubscription);

        let chargeAmount = 0;
        if (amount !== undefined && amount !== null && amount !== '') {
            const parsedAmount = parseFloat(amount);
            if (Number.isFinite(parsedAmount)) {
                chargeAmount = Number(parsedAmount.toFixed(2));
            }
        }
        const hasOneTimeCharge = chargeAmount > 0;

        const invoiceNumber = `INV-${Date.now()}`;

        let transactionId = null;
        let authCode = null;
        let transactionMessage = null;
        let transactionSuccess = false;
        let transactionDebug = null;
        let transactionErrorText = null;

        if (hasOneTimeCharge) {
            const payload = {
                createTransactionRequest: {
                    '@_xmlns': 'AnetApi/xml/v1/schema/AnetApiSchema.xsd',
                    merchantAuthentication: { name: loginId, transactionKey },
                    refId: `ref${Date.now()}`,
                    transactionRequest: {
                        transactionType: 'authCaptureTransaction',
                        amount: chargeAmount,
                        payment: {
                            creditCard: {
                                cardNumber: cardNumber.replace(/\s/g, ''),
                                expirationDate,
                                cardCode
                            }
                        },
                        order: { invoiceNumber },
                        ...(chargeLineItems.length > 0 ? {
                            lineItems: {
                                lineItem: chargeLineItems.map((item, idx) => {
                                    const quantityValue = Math.max(1, Number(item?.quantity) || 1);
                                    const unitPriceRaw = parseFloat(item?.unitPrice);
                                    const unitPriceValue = Number.isFinite(unitPriceRaw) ? unitPriceRaw.toFixed(2) : '0.00';
                                    return {
                                        itemId: item?.itemId || String(idx + 1),
                                        name: (item?.name || '').slice(0, 31),
                                        description: (item?.description || '').slice(0, 255),
                                        quantity: String(quantityValue),
                                        unitPrice: unitPriceValue,
                                        taxable: String(Boolean(item?.taxable))
                                    };
                                })
                            }
                        } : {}),
                        ...(email ? {
                            customer: {
                                ...(customerId ? { id: customerId } : {}),
                                email
                            }
                        } : {}),
                        billTo: {
                            firstName: billFirstName,
                            lastName: billLastName,
                            company: billCompany,
                            address: combinedBillAddress,
                            city: billCity,
                            state: billState,
                            zip: billZip,
                            country: billCountryValue
                        },
                        transactionSettings: {
                            setting: [
                                { settingName: 'testRequest', settingValue: isProduction ? 'false' : 'true' }
                            ]
                        }
                    }
                }
            };

            const xmlBody = builder.build(payload);

            const authNetResponse = await fetchFn(authorizeNetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/xml', 'Accept': 'application/xml' },
                body: xmlBody
            });

            console.log(`Authorize.net ${isProduction ? 'PRODUCTION' : 'SANDBOX'} response status:`, authNetResponse.status);

            const responseText = await authNetResponse.text();
            console.log('Raw Authorize.net XML response (first 1000 chars):', responseText.substring(0, 1000));

            const parser = new FastXMLParser({
                ignoreAttributes: false,
                parseTagValue: true,
                parseNodeValue: true,
                trimValues: true,
                parseTrueNumberOnly: false
            });

            let parsed;
            try {
                parsed = parser.parse(responseText);
                console.log('Full parsed XML structure:', JSON.stringify(parsed, null, 2));
            } catch (e) {
                console.error('XML parsing error:', e);
                return res.status(500).json({ success: false, error: 'Invalid XML response from Authorize.net', details: responseText.slice(0, 200) });
            }

            const messages = parsed?.createTransactionResponse?.messages;
            const txr = parsed?.createTransactionResponse?.transactionResponse;

            const topLevelError = parsed?.ErrorResponse?.messages?.message;
            const topLevelErrorText = Array.isArray(topLevelError)
                ? topLevelError[0]?.text || topLevelError[0]?.description
                : topLevelError?.text || topLevelError?.description;
            const topLevelErrorCode = Array.isArray(topLevelError)
                ? topLevelError[0]?.code
                : topLevelError?.code;

            console.log('Parsed response structure:', JSON.stringify({
                messagesResultCode: messages?.resultCode,
                txrResponseCode: txr?.responseCode,
                txrTransId: txr?.transId,
                txrAuthCode: txr?.authCode,
                txrMessages: txr?.messages,
                txrErrors: txr?.errors,
                fullTxr: txr
            }, null, 2));

            const possiblePaths = [
                () => txr?.transId,
                () => txr?.transactionId,
                () => txr?.['transId'],
                () => parsed?.createTransactionResponse?.transactionResponse?.transId,
                () => parsed?.createTransactionResponse?.transactionResponse?.['transId'],
                () => parsed?.createTransactionResponse?.transactionResponse?.transId?.[0],
                () => txr?.transactionResponse?.transId,
                () => txr?.transactionResponse?.['transId']
            ];

            for (const getPath of possiblePaths) {
                try {
                    const value = getPath();
                    if (value !== null && value !== undefined && value !== '') {
                        transactionId = String(value);
                        console.log('Found transaction ID via path:', getPath.toString(), '=', transactionId);
                        break;
                    }
                } catch (err) {
                    // continue
                }
            }

            if (!transactionId && (txr?.transId === '0' || txr?.transId === 0)) {
                transactionId = '0';
                console.log('Transaction ID is 0 (test/sandbox transaction - this is normal)');
            }

            console.log('Transaction ID extraction result:', {
                found: !!transactionId,
                value: transactionId,
                txrKeys: txr ? Object.keys(txr) : 'txr is null',
                txrTransId: txr?.transId,
                txrTransactionId: txr?.transactionId,
                fullTxrStructure: JSON.stringify(txr, null, 2)
            });

            transactionErrorText = txr?.errors?.error?.errorText ||
                txr?.errors?.error?.[0]?.errorText ||
                (Array.isArray(txr?.errors?.error) ? txr.errors.error[0]?.errorText : null) ||
                messages?.message?.text ||
                (Array.isArray(messages?.message) ? messages.message[0]?.text : null) ||
                topLevelErrorText ||
                'Transaction failed';

            const resultCodeOk = messages?.resultCode === 'Ok';
            const responseCodeOk = txr?.responseCode === '1';
            const hasTransactionId = !!transactionId;
            const errorIndicatesSuccess = transactionErrorText && transactionErrorText.toLowerCase().includes('successful');
            const ok = (resultCodeOk && responseCodeOk) || (hasTransactionId && !txr?.errors) || errorIndicatesSuccess;

            if (!ok) {
                console.log(`❌ ${isProduction ? 'PRODUCTION' : 'SANDBOX'} Transaction Failed:`, {
                    error: transactionErrorText,
                    errorCode: topLevelErrorCode || txr?.errors?.error?.errorCode,
                    amount: chargeAmount,
                    environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
                    responseCode: txr?.responseCode,
                    resultCode: messages?.resultCode
                });

                return res.status(400).json({
                    success: false,
                    error: transactionErrorText,
                    errorCode: topLevelErrorCode || txr?.errors?.error?.errorCode,
                    raw: parsed,
                    environment: isProduction ? 'production' : 'sandbox'
                });
            }

            transactionSuccess = true;
            authCode = txr?.authCode || null;
            transactionMessage = txr?.messages?.message?.description ||
                (Array.isArray(txr?.messages?.message) ? txr.messages.message[0]?.description : null) ||
                'Approved';
            transactionErrorText = null;

            transactionDebug = {
                hasTransactionId: !!transactionId,
                transactionIdValue: transactionId,
                txrResponseCode: txr?.responseCode,
                messagesResultCode: messages?.resultCode
            };

            console.log(`✅ ${isProduction ? 'PRODUCTION' : 'SANDBOX'} Transaction Approved:`, {
                transactionId,
                amount: chargeAmount.toFixed(2),
                authCode,
                environment: isProduction ? 'PRODUCTION' : 'SANDBOX'
            });
        } else {
            console.log('No one-time amount to charge; skipping immediate transaction.');
            transactionMessage = 'Subscription setup only - no one-time charge.';
        }

        const subscriptionResults = [];
        if (requestedSubscriptionItems.length > 0) {
            if (!hasOneTimeCharge || transactionSuccess) {
                for (const [index, subItem] of requestedSubscriptionItems.entries()) {
                    try {
                        const subscriptionName = (subItem?.name || `Subscription ${index + 1}`).toString().slice(0, 50);
                        const quantity = Math.max(1, Number(subItem?.quantity) || 1);
                        const unitPrice = Number(parseFloat(subItem?.unitPrice).toFixed(2)) || 0;
                        const subtotalSource = subItem?.subtotal !== undefined
                            ? Number(parseFloat(subItem.subtotal).toFixed(2))
                            : unitPrice * quantity;
                        const subscriptionAmount = Number(parseFloat(subtotalSource).toFixed(2));

                        if (!subscriptionAmount || subscriptionAmount <= 0) {
                            subscriptionResults.push({
                                success: false,
                                itemName: subscriptionName,
                                amount: subscriptionAmount,
                                error: 'Invalid subscription amount'
                            });
                            continue;
                        }

                        const intervalRaw = (subItem?.interval || subItem?.subscriptionInterval || 'monthly').toString().toLowerCase();
                        const intervalUnit = intervalRaw.startsWith('day') ? 'days' : 'months';
                        const intervalLength = intervalUnit === 'months' ? 1 : Math.max(1, Number(subItem?.intervalLength) || 1);
                        const startDate = getValidSubscriptionStartDate(subItem?.startDate || subItem?.subscriptionStartDate);

                        const subscription = {
                            name: subscriptionName,
                            paymentSchedule: {
                                interval: {
                                    length: String(intervalLength),
                                    unit: intervalUnit
                                },
                                startDate,
                                totalOccurrences: '9999',
                                trialOccurrences: '0'
                            },
                            amount: subscriptionAmount.toFixed(2),
                            trialAmount: '0.00',
                            payment: {
                                creditCard: {
                                    cardNumber: cardNumber.replace(/\s/g, ''),
                                    expirationDate
                                }
                            }
                        };

                        if (subItem?.description) {
                            subscription.order = {
                                invoiceNumber: (`SUB-${Date.now()}-${index + 1}`).slice(0, 20),
                                description: subItem.description.slice(0, 255)
                            };
                        }

                        if (email || customerId) {
                            subscription.customer = {
                                ...(customerId ? { id: customerId } : {}),
                                email
                            };
                        }

                        subscription.billTo = {
                            firstName: billFirstName,
                            lastName: billLastName,
                            company: billCompany,
                            address: combinedBillAddress,
                            city: billCity,
                            state: billState,
                            zip: billZip,
                            country: billCountryValue
                        };

                        const subscriptionPayload = {
                            ARBCreateSubscriptionRequest: {
                                '@_xmlns': 'AnetApi/xml/v1/schema/AnetApiSchema.xsd',
                                merchantAuthentication: { name: loginId, transactionKey },
                                refId: `sub${Date.now()}${index}`,
                                subscription
                            }
                        };

                        const subscriptionXml = builder.build(subscriptionPayload);
                        const subscriptionResponse = await fetchFn(authorizeNetUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'text/xml', 'Accept': 'application/xml' },
                            body: subscriptionXml
                        });

                        const subscriptionResponseText = await subscriptionResponse.text();
                        console.log(`Authorize.net subscription response status (${subscriptionName}):`, subscriptionResponse.status);
                        console.log('Subscription response XML (first 1000 chars):', subscriptionResponseText.substring(0, 1000));

                        const subscriptionParser = new FastXMLParser({
                            ignoreAttributes: false,
                            parseTagValue: true,
                            parseNodeValue: true,
                            trimValues: true,
                            parseTrueNumberOnly: false
                        });

                        let subscriptionParsed;
                        try {
                            subscriptionParsed = subscriptionParser.parse(subscriptionResponseText);
                        } catch (err) {
                            console.error('Subscription XML parsing error:', err);
                            subscriptionResults.push({
                                success: false,
                                itemName: subscriptionName,
                                amount: subscriptionAmount,
                                interval: intervalUnit,
                                startDate,
                                error: 'Invalid subscription response from Authorize.net'
                            });
                            continue;
                        }

                        const subscriptionMessages = subscriptionParsed?.ARBCreateSubscriptionResponse?.messages;
                        const subscriptionId = subscriptionParsed?.ARBCreateSubscriptionResponse?.subscriptionId;
                        const subscriptionResultCode = subscriptionMessages?.resultCode;
                        const subscriptionMessageText = subscriptionMessages?.message?.text ||
                            (Array.isArray(subscriptionMessages?.message) ? subscriptionMessages.message[0]?.text : null);
                        const subscriptionErrorText = subscriptionParsed?.ErrorResponse?.messages?.message?.text || subscriptionMessageText;

                        if (subscriptionResultCode === 'Ok' && subscriptionId) {
                            subscriptionResults.push({
                                success: true,
                                subscriptionId: String(subscriptionId),
                                itemName: subscriptionName,
                                amount: subscriptionAmount.toFixed(2),
                                interval: intervalUnit,
                                startDate
                            });
                        } else {
                            subscriptionResults.push({
                                success: false,
                                itemName: subscriptionName,
                                amount: subscriptionAmount.toFixed(2),
                                interval: intervalUnit,
                                startDate,
                                error: subscriptionErrorText || 'Subscription creation failed'
                            });
                        }
                    } catch (subscriptionError) {
                        console.error('Subscription processing error:', subscriptionError);
                        subscriptionResults.push({
                            success: false,
                            itemName: subItem?.name || `Subscription ${index + 1}`,
                            amount: subItem?.subtotal || null,
                            error: subscriptionError.message || 'Subscription processing error'
                        });
                    }
                }
            } else {
                console.log('Skipping subscription creation because initial transaction failed.');
            }
        }

        const subscriptionSuccess = subscriptionResults.some(result => result.success);
        const overallSuccess = transactionSuccess || subscriptionSuccess;

        const responseData = {
            success: overallSuccess,
            transactionId: transactionSuccess ? transactionId : null,
            invoiceNumber: transactionSuccess ? invoiceNumber : null,
            message: transactionMessage || (overallSuccess ? 'Processed successfully' : transactionErrorText || 'Transaction failed'),
            authCode: transactionSuccess ? authCode : null,
            amount: chargeAmount.toFixed(2),
            environment: isProduction ? 'production' : 'sandbox',
            hasSubscription: requestedSubscriptionItems.length > 0,
            subscriptionMonthlyTotal: subscriptionMonthlyTotal || null,
            subscriptionResults
        };

        if (transactionDebug) {
            responseData.debug = transactionDebug;
        }

        if (!overallSuccess) {
            responseData.error = transactionErrorText || subscriptionResults.find(r => !r.success)?.error || 'Transaction failed';
        } else if (subscriptionResults.some(r => !r.success)) {
            responseData.subscriptionWarnings = subscriptionResults.filter(r => !r.success);
        }

        console.log('Sending response:', JSON.stringify(responseData, null, 2));
        return res.status(overallSuccess ? 200 : 400).json(responseData);
    } catch (error) {
        console.error('Unhandled payment processing error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
    }
}

// Validation helpers stored globally to avoid redeclaration during hot reload

function formatDateToYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getValidSubscriptionStartDate(requestedDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (requestedDate) {
        const parsed = new Date(requestedDate);
        if (!Number.isNaN(parsed.getTime())) {
            parsed.setHours(0, 0, 0, 0);
            if (parsed < today) {
                return formatDateToYYYYMMDD(today);
            }
            return formatDateToYYYYMMDD(parsed);
        }
    }
    return formatDateToYYYYMMDD(today);
}
