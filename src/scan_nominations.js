const {parseContractFiles} = require('./parse-files');
const {default: Nomination} = require('./models/Nomination');
const dayjs = require('dayjs');
const OpenAI = require('openai');

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

async function getArrivalPeriodFromAI(tableArray) {
    if (process.env.ENV === 'dev') return "2025/6/18";

    const prompt = `Extract the date from this table data: ${JSON.stringify(tableArray)}

Find "Delivery Window" content and return ONLY the date in Y/m/d format.

Rules:
- For ranges, pick the FIRST date
- Return format: Y/m/d (like 2025/8/16)
- Return ONLY the date, no explanations

Examples:
"Delivery Window: 03/08/2025" → 2025/8/3
"Delivery Window: 16-19 Aug 2025" → 2025/8/16  
"Delivery Window: 25 Dec 2024 - 02 Jan 2025" → 2024/12/25

Output only the date:`;

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            {
                role: "system",
                content: "You are a date extractor. Return only the requested date in Y/m/d format, nothing else."
            },
            {
                role: "user",
                content: prompt
            }
        ],
        max_tokens: 20,
        temperature: 0
    });

    const result = response.choices[0].message.content.trim().replace(/"/g, '');
    return /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(result) ? result : null;
}


async function getKeywordsFromFullQuestionsByAI(fullSentence) {
    if (process.env.ENV === 'dev') return `Nomination Type as Test${Math.random()}`;
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            {
                role: "system",
                content: "Extract only one keyword for the next prompts I will send.  Rules: E.g. -----'1.\\tThe Nominal Quantity Range shall be between 3.3 T 3.5 T. (both numbers inclusive)\\n2.\\tNo later than 30 Days prior to the start of the Delivery Window Range, Seller shall declare the Nominal Quantity falling within the Nominal Quantity Range.\\n3.\\tIn the absence of a Nominal Quantity nomination by Seller, the Nominal Quantity shall be deemed to be 3.4 T\\n4.\\tThere shall be a Cargo Tolerance of +/- 5% of Nominal Quantity at Seller’s option\\n'--------- in this case, the keywords is Nominal Quantity as 3.4T. E.g. ------- The Initial Loading Window shall be August 16-17, 2025.\\nSeller shall nominate a 1 Day Loading Window that falls entirely within the Initial Loading Window range no later than twenty (20) days prior to the first day of the Initial Loading Window.--------- in this case the keywords is  1 Day Loading Window as August 16, 2025. E.g. --------------The Base Ship shall be: Amazon Ship\\n\\nBuyer shall have the right to substitute the nominated Ship with another Ship no later than thirty (30) days prior to the first day of the Delivery Window, subject to the successful completion vehicle checks.\\n--------- in this case, the keywords is Base Ship as Amazon Ship.  E.g. --------Base Unloading Port: Singapore\\n\\nNo later than 15 days prior to the Delivery Period, Buyer may nominate an alternate Unloading Port within the same country \\n------. in this case the keywords is Alternate Unloading Port as Singapore. E.g. -------  The Loading Port shall be Bintulu, Malaysia, \\n\\n\\nSeller has the right to nominate an Loading Port by notifying Buyer no later than 30 days prior to the first day of the Delivery Window Range.\\n----- in this case, the keywords is Loading Port as Bintulu, Malaysia "
            },
            {
                role: "user",
                content: JSON.stringify(fullSentence)
            }
        ],
        max_tokens: 100,
        temperature: 0
    });

    return response.choices[0].message.content.trim().replace(/"/g, '');
}

function extractBuyerSeller(tableArray) {
    let buyer = '', seller = '';
    for (const row of tableArray) {
        const key = row[0].toLowerCase().trim();
        if (key === 'buyer') buyer = row[1][0]?.trim();
        if (key === 'seller') seller = row[1][0]?.trim();
    }
    return {buyer, seller};
}

function findNominations(tableArray) {
    const nominations = [];
    const pattern = /[^.]*\(?\s*\d+\s*\)?\s*days\s+prior\s+to[^.]*/gi;
    for (const row of tableArray) {
        for (const line of row[1]) {
            const matches = line.match(pattern);
            matches?.forEach(m => {
                nominations.push({
                    nomination_type: row[0].trim(),
                    day_sentence: m.trim(),
                    full_sentence: row[1].join("\n")
                });
            });
        }
    }
    return nominations;
}

function extractDays(sentence) {
    const match = sentence.match(/\(?\s*(\d+)\s*\)?\s*days\s+prior\s+to/i);
    return match ? parseInt(match[1]) : 0;
}

function calculateNominationDate(arrival, days) {
    const [y, m, d] = arrival.split('/').map(Number);
    return dayjs(new Date(y, m - 1, d)).subtract(days, 'day').format('YYYY-MM-DD');
}

async function processSingleContract(contract) {
    const existing = await Nomination.exists({ contract_name: contract.contractFileName });
    if (existing) return [];

    const { tableArray } = contract;
    const arrival = await getArrivalPeriodFromAI(tableArray);
    const { buyer, seller } = extractBuyerSeller(tableArray);
    const nominations = findNominations(tableArray);

    return await Promise.all(nominations.map(async (n) => {
        const days = extractDays(n.day_sentence);
        const keyword = await getKeywordsFromFullQuestionsByAI(n.full_sentence);
        return {
            contract_name: contract.contractFileName,
            buyer,
            seller,
            arrival_period: dayjs(arrival).format('YYYY-MM-DD'),
            nomination_date: calculateNominationDate(arrival, days),
            nomination_type: n.nomination_type,
            nomination_keyword: keyword,
            nomination_description: n.day_sentence,
            for_seller_or_buyer: n.day_sentence.toLowerCase().includes('seller') ? 'seller' : 'buyer',
        };
    }));
}


async function scanNominationsFolder() {
    const folder = process.env.CONTRACTS_FOLDER || './contracts';
    const contracts = await parseContractFiles(folder);
    let all = [];

    for (const contract of contracts) {
        const nominations = await processSingleContract(contract);
        if (nominations.length === 0) continue;
        await Nomination.insertMany(nominations);
        all.push(...nominations);
    }

    return all;
}

module.exports = {scanNominationsFolder};
