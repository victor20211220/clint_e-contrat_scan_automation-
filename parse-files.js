const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const xml2js = require('xml2js');

async function parseDocxTablesToArray(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        const documentXml = await zip.file('word/document.xml').async('string');
        const parser = new xml2js.Parser();
        const document = await parser.parseStringPromise(documentXml);

        return extractTablesAsArrays(document);
    } catch (error) {
        console.error('Error parsing DOCX:', error);
        return [];
    }
}

function extractTablesAsArrays(document) {
    const tables = [];
    const body = document['w:document']['w:body'][0];
    const tableElements = body['w:tbl'] || [];

    tableElements.forEach(table => {
        const tableArray = parseTableToArray(table);
        if (tableArray.length > 0) {
            tables.push(tableArray);
        }
    });

    return tables;
}

function parseTableToArray(tableElement) {
    const rows = [];
    const tableRows = tableElement['w:tr'] || [];

    tableRows.forEach(row => {
        const cells = [];
        const tableCells = row['w:tc'] || [];

        tableCells.forEach((cell, cellIndex) => {
            const cellText = extractCellText(cell);

            // For the second cell (index 1), always convert to array by splitting on line breaks
            if (cellIndex === 1) {
                if (cellText.includes('\n')) {
                    // Split by line breaks and filter out empty lines
                    const lines = cellText.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);

                    cells.push(lines);
                } else {
                    // Even for single line content, put it in an array
                    cells.push([cellText]);
                }
            } else {
                // For other cells (index 0, 2, 3, etc.), keep as string
                cells.push(cellText);
            }
        });

        if (cells.length > 0) {
            rows.push(cells);
        }
    });

    return rows;
}

function extractCellText(cell) {
    let text = '';
    const paragraphs = cell['w:p'] || [];

    paragraphs.forEach((paragraph, pIndex) => {
        const runs = paragraph['w:r'] || [];
        let paragraphText = '';

        runs.forEach(run => {
            const textElements = run['w:t'] || [];
            textElements.forEach(textElement => {
                if (typeof textElement === 'string') {
                    paragraphText += textElement;
                } else if (textElement._) {
                    paragraphText += textElement._;
                }
            });
        });

        // Add paragraph text
        text += paragraphText;

        // Add line break between paragraphs (except for the last one)
        if (pIndex < paragraphs.length - 1 && paragraphText) {
            text += '\n';
        }
    });

    return text.trim();
}

async function parseContractFiles(folderPath) {
    try {
        const files = fs.readdirSync(folderPath);
        const docxFiles = files.filter(file => path.extname(file).toLowerCase() === '.docx');
        const results = [];

        for (const file of docxFiles) {
            const filePath = path.join(folderPath, file);
            const contractFileName = path.basename(file, path.extname(file));

            console.log(`Processing: ${file}`);

            const tables = await parseDocxTablesToArray(filePath);

            if (tables.length > 0) {
                const tableArray = tables[0]; // Get the first table
                console.log(tableArray);
                results.push({
                    contractFileName,
                    tableArray
                });
            } else {
                console.warn(`No tables found in ${file}`);
            }
        }

        return results;
    } catch (error) {
        console.error('Error parsing contract files:', error);
        return [];
    }
}

module.exports = { parseContractFiles };