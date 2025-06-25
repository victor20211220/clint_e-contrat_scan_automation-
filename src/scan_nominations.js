const fs = require('fs');
const OpenAI = require('openai');
const { parseContractFiles } = require('./parse-files');

// Load environment variables
require('dotenv').config();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function getArrivalPeriodFromAI(tableArray) {
    // Check if we're in development mode
    if (process.env.ENV === 'dev') {
        console.log('🔧 Development mode: Using fixed arrival period date');
        return "2025/6/18";
    }

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

    try {
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

        let result = response.choices[0].message.content.trim();

        // Clean up any extra text and extract just the date
        result = result.replace(/"/g, '');
        result = result.replace(/.*?(\d{4}\/\d{1,2}\/\d{1,2}).*/, '$1');

        // Validate the date format
        if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(result)) {
            console.warn('Invalid date format from OpenAI:', result);
            return null;
        }

        return result;
    } catch (error) {
        console.error('Error with OpenAI API for arrival period:', error);
        return null;
    }
}

function extractBuyerSeller(tableArray) {
    let buyer = '';
    let seller = '';

    for (const row of tableArray) {
        if (row.length >= 2) {
            const firstCell = row[0].toLowerCase().trim();
            if (firstCell === 'buyer') {
                // Second cell is always an array now, take the first element
                buyer = row[1][0].trim();
            } else if (firstCell === 'seller') {
                // Second cell is always an array now, take the first element
                seller = row[1][0].trim();
            }
        }
    }

    return { buyer, seller };
}

function findSentencesWithDaysExpression(tableArray) {
    const sentences = [];
    // Updated regex to handle all spacing variations - removed requirement for ending dot
    const daysPattern = /[^.]*\(?\s*\d+\s*\)?\s*days\s+prior\s+to[^.]*/gi;

    // Process each row - only check the second cell (index 1) which contains the array
    for (const row of tableArray) {
        if (row.length >= 2) {
            // Second cell (index 1) is always an array - process each line
            for (const line of row[1]) {
                const lineMatches = line.match(daysPattern);
                if (lineMatches) {
                    lineMatches.forEach(match => {
                        const cleanSentence = match.trim();
                        if (cleanSentence) {
                            console.log(`Found sentence: "${cleanSentence}"`);
                            sentences.push(cleanSentence);
                        }
                    });
                }
            }
        }
    }

    console.log(`Total sentences found with "days prior to": ${sentences.length}`);
    return sentences;
}

function extractDaysFromSentence(sentence) {
    // Updated regex to handle all spacing variations: (30)days, 30days, (15) days, 15 days
    const daysMatch = sentence.match(/\(?\s*(\d+)\s*\)?\s*days\s+prior\s+to/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : 0;
    console.log(`Extracted ${days} days from: "${sentence.substring(0, 50)}..."`);
    return days;
}

function calculateNominationDate(arrivalDate, daysPrior) {
    if (!arrivalDate || daysPrior <= 0) return '';

    try {
        // Parse the Y/m/d format
        const [year, month, day] = arrivalDate.split('/').map(Number);
        const date = new Date(year, month - 1, day); // month is 0-indexed

        // Subtract days
        date.setDate(date.getDate() - daysPrior);

        // Format as Y/m/d
        const resultYear = date.getFullYear();
        const resultMonth = date.getMonth() + 1; // Convert back to 1-indexed
        const resultDay = date.getDate();

        return `${resultYear}/${resultMonth}/${resultDay}`;
    } catch (error) {
        console.error('Error calculating nomination date:', error);
        return '';
    }
}

async function processContractData(tableArray) {
    try {
        console.log('Table structure:');
        tableArray.forEach((row, index) => {
            console.log(`Row ${index}:`, row[0], Array.isArray(row[1]) ? `[${row[1].length} lines]` : row[1]);
        });

        // Get arrival period from OpenAI
        const arrivalPeriodDate = await getArrivalPeriodFromAI(tableArray);

        if (!arrivalPeriodDate) {
            console.warn('Could not extract arrival period date');
            return [];
        }

        console.log(`\x1b[32mArrival period date: ${arrivalPeriodDate}\x1b[0m`);

        // Extract buyer and seller using JavaScript
        const { buyer, seller } = extractBuyerSeller(tableArray);

        if (!buyer || !seller) {
            console.warn('Could not extract buyer or seller information');
            console.log(`Buyer: "${buyer}", Seller: "${seller}"`);
            return [];
        }

        console.log(`Buyer: ${buyer}, Seller: ${seller}`);

        // Find sentences with "days prior to" expression
        const sentences = findSentencesWithDaysExpression(tableArray);

        if (sentences.length === 0) {
            console.warn('No sentences found with "days prior to" expression');
            return [];
        }

        // Process each sentence
        const results = [];
        for (const sentence of sentences) {
            const daysPrior = extractDaysFromSentence(sentence);
            if (daysPrior > 0) {
                const nominationDueDate = calculateNominationDate(arrivalPeriodDate, daysPrior);

                results.push({
                    buyer: buyer,
                    seller: seller,
                    arrivalPeriodDate: arrivalPeriodDate,
                    nomination_due: nominationDueDate,
                    description: sentence
                });

                console.log(`✓ Created entry: ${daysPrior} days prior → ${nominationDueDate}`);
            } else {
                console.warn(`Could not extract days from sentence: "${sentence.substring(0, 50)}..."`);
            }
        }

        return results;
    } catch (error) {
        console.error('Error processing contract data:', error);
        return [];
    }
}

function createDatabaseCSV() {
    const headers = ['Contract #', 'Buyer', 'Seller', 'Arrival Period', 'Nomination due', 'Description'];
    const csvContent = headers.join(',') + '\n';

    // Delete existing file if it exists
    if (fs.existsSync('database.csv')) {
        fs.unlinkSync('database.csv');
        console.log('Existing database.csv deleted');
    }

    fs.writeFileSync('database.csv', csvContent, 'utf8');
    console.log('Created new database.csv with headers');
}

function cleanEncodingIssues(text) {
    if (typeof text !== 'string') return text;

    return text
        // Fix common encoding issues
        .replace(/â€œ/g, '"')     // Opening smart quote
        .replace(/â€/g, '"')      // Closing smart quote
        .replace(/â€™/g, "'")     // Smart apostrophe
        .replace(/â€"/g, '–')     // En dash
        .replace(/â€"/g, '—')     // Em dash
        .replace(/Â/g, '')        // Non-breaking space artifacts
        .replace(/â€¦/g, '...')   // Ellipsis
        .replace(/â€¢/g, '•')     // Bullet point
        // Clean up any remaining problematic characters
        .replace(/[^\x00-\x7F]/g, (char) => {
            // Replace non-ASCII characters with their closest ASCII equivalent
            const charCode = char.charCodeAt(0);
            if (charCode === 8220 || charCode === 8221) return '"'; // Smart quotes
            if (charCode === 8217 || charCode === 8216) return "'"; // Smart apostrophes
            if (charCode === 8211 || charCode === 8212) return '-'; // Dashes
            return char; // Keep other characters as-is
        });
}

function appendToCSV(contractFileName, data) {
    const csvRows = data.map(item => {
        const row = [
            cleanEncodingIssues(contractFileName),
            `"${cleanEncodingIssues(item.buyer)}"`,
            `"${cleanEncodingIssues(item.seller)}"`,
            item.arrivalPeriodDate,  // Already in Y/m/d format
            item.nomination_due,     // Already in Y/m/d format
            `"${cleanEncodingIssues(item.description)}"`
        ];
        return row.join(',');
    });

    // Add the contract data
    const csvContent = csvRows.join('\n') + '\n';
    fs.appendFileSync('database.csv', csvContent, 'utf8');

    // Add an empty row after each contract file
    fs.appendFileSync('database.csv', '\n', 'utf8');
}

async function main() {
    try {
        // Set the folder path containing contract files
        const contractsFolder = process.env.CONTRACTS_FOLDER || './contracts';

        // Create new database.csv
        createDatabaseCSV();

        // Parse all contract files
        console.log('Parsing contract files...');
        const contractData = await parseContractFiles(contractsFolder);

        if (contractData.length === 0) {
            console.log('No contract files found or processed');
            return;
        }

        console.log(`Found ${contractData.length} contract files to process`);
        console.log(`Environment: ${process.env.ENV || 'production'}`);

        if (process.env.ENV === 'dev') {
            console.log('🔧 Running in development mode - using fixed arrival date');
        }

        // Process each contract with OpenAI
        for (const contract of contractData) {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`Processing contract: ${contract.contractFileName}`);
            console.log(`${'='.repeat(50)}`);

            try {
                const processedData = await processContractData(contract.tableArray);

                if (processedData && processedData.length > 0) {
                    appendToCSV(contract.contractFileName, processedData);
                    console.log(`\x1b[32m✓ Added ${processedData.length} entries for ${contract.contractFileName}\x1b[0m`);
                } else {
                    console.warn(`⚠ No data extracted for ${contract.contractFileName}`);
                }

                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error processing ${contract.contractFileName}:`, error);
            }
        }

        console.log('\n✅ Processing complete! Check database.csv for results.');

    } catch (error) {
        console.error('Main process error:', error);
    }
}

// Check if OpenAI API key is set (only required in production)
if (process.env.ENV !== 'dev' && !process.env.OPENAI_API_KEY) {
    console.error('Please set your OPENAI_API_KEY environment variable in .env file');
    console.log('Create a .env file with: OPENAI_API_KEY=your-api-key-here');
    console.log('Or set ENV=dev for development mode');
    process.exit(1);
}

// Run the application
main();