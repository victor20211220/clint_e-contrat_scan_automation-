const {parseContractFiles} = require('./parse-files');
const { default: Nomination } = require('./models/Nomination');
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
    const existing = await Nomination.exists({contract_name: contract.contractFileName});
    if (existing) return [];

    const {tableArray} = contract;
    const arrival = await getArrivalPeriodFromAI(tableArray);
    const {buyer, seller} = extractBuyerSeller(tableArray);
    const nominations = findNominations(tableArray);

    return nominations.map(n => {
        const days = extractDays(n.day_sentence);
        return {
            contract_name: contract.contractFileName,
            buyer,
            seller,
            arrival_period: dayjs(arrival).format('YYYY-MM-DD'),
            nomination_date: calculateNominationDate(arrival, days),
            nomination_type: n.nomination_type,
            nomination_keyword: `${n.nomination_type} as Test${Math.random()}`, //n.full_sentence
            for_seller_or_buyer: n.day_sentence.toLowerCase().includes('seller') ? 'seller' : 'buyer'
        };
    });
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
