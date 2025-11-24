/**
 * Converts tab-separated Excel data (pasted format) to JSON array
 * @param {string} excelData - The raw Excel data as a string (tab-separated values)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.convertNull - Convert "null" strings to actual null values (default: true)
 * @param {boolean} options.trimValues - Trim whitespace from values (default: true)
 * @param {boolean} options.convertNumbers - Convert numeric strings to numbers (default: true)
 * @returns {Array<Object>} Array of objects where keys are column headers
 */
export function excelToJson(excelData, options = {}) {
	const {
		convertNull = true,
		trimValues = true,
		convertNumbers = true,
	} = options;

	// Split into lines
	const lines = excelData.split(/\r?\n/).filter(line => line.trim().length > 0);
	
	if (lines.length === 0) {
		return [];
	}

	// First line contains headers
	const headerLine = lines[0];
	// Split by tab and handle leading/trailing tabs
	const rawHeaders = headerLine.split('\t');
	
	// Remove leading empty headers (from leading tab)
	let startIndex = 0;
	while (startIndex < rawHeaders.length && (!rawHeaders[startIndex] || rawHeaders[startIndex].trim().length === 0)) {
		startIndex++;
	}
	
	const headers = rawHeaders.slice(startIndex).map(h => {
		let header = h;
		if (trimValues) {
			header = header.trim();
		}
		return header;
	}).filter(h => h.length > 0); // Remove empty headers

	// Process data rows
	const result = [];
	
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		const rawValues = line.split('\t');
		
		// Remove leading empty values to match header alignment
		const values = rawValues.slice(startIndex);
		
		const row = {};
		
		headers.forEach((header, index) => {
			// Skip empty headers
			if (!header || header.length === 0) {
				return;
			}
			
			let value = values[index] || '';
			
			// Trim whitespace
			if (trimValues) {
				value = value.trim();
			}
			
			// Convert "null" string to actual null
			if (convertNull && (value === 'null' || value === '')) {
				value = null;
			}
			
			// Convert numeric strings to numbers
			if (convertNumbers && value !== null && value !== '') {
				// Check if it's a number (including decimals)
				const numValue = parseFloat(value);
				if (!isNaN(numValue) && isFinite(numValue) && value.trim() === String(numValue)) {
					value = numValue;
				}
			}
			
			row[header] = value;
		});
		
		result.push(row);
	}
	
	return result;
}

/**
 * Reads Excel data from a file and converts it to JSON
 * @param {string} filePath - Path to the Excel data file
 * @param {Object} options - Optional configuration (same as excelToJson)
 * @returns {Promise<Array<Object>>} Array of objects
 */
export async function excelFileToJson(filePath, options = {}) {
	try {
		const response = await fetch(filePath);
		const text = await response.text();
		return excelToJson(text, options);
	} catch (error) {
		console.error('Error reading Excel file:', error);
		throw error;
	}
}

