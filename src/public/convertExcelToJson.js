import { readFileSync, writeFileSync } from 'fs';
import { excelToJson } from '../utils/excelToJson.js';

// Read the Excel data file
const excelData = readFileSync('excel', 'utf-8');

// Convert to JSON
const jsonData = excelToJson(excelData, {
	convertNull: true,
	trimValues: true,
	convertNumbers: true
});

// Write to output file
writeFileSync('excel-data.json', JSON.stringify(jsonData, null, 2), 'utf-8');

console.log(`✅ Converted ${jsonData.length} rows from Excel to JSON`);
console.log(`📄 Output saved to: excel-data.json`);
console.log(`\nFirst row sample:`, JSON.stringify(jsonData[0], null, 2));

