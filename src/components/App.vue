<template>
	<div class="app-container">
		<div class="controls">
			<label for="excel-file-input" class="file-input-label">
				<input
					id="excel-file-input"
					type="file"
					accept=".xlsx,.xls,.csv"
					@change="handleFileUpload"
					style="display: none;"
				/>
				<button type="button" @click="triggerFileInput">Upload Excel File</button>
			</label>
			<label for="json-file-input" class="file-input-label">
				<input
					id="json-file-input"
					type="file"
					accept=".json"
					@change="handleJsonUpload"
					style="display: none;"
				/>
				<button type="button" @click="triggerJsonInput">Upload JSON File</button>
			</label>
			<button @click="generateLargedatasets">Generate Sample Data(150000)</button>
			<span class="info">Current dataset size: {{ (currentData?.length || 0) * 3 / 2 }} records</span>
			<span class="info">Column Header Cell Count: {{ horizontalHeaderCount.toLocaleString() }}</span>
			<span v-if="uploading" class="upload-status">Processing file...</span>
		</div>
		<div v-if="fieldAnalysis && fieldAnalysis.fieldStats" class="field-stats-container">
			<div class="field-stats-header">
				<h3 class="field-stats-title">Field Statistics (Unique Value Counts)</h3>
				<button 
					@click="showFieldStats = !showFieldStats" 
					class="field-stats-toggle"
					:aria-label="showFieldStats ? 'Hide Field Statistics' : 'Show Field Statistics'"
				>
					{{ showFieldStats ? '▼' : '▶' }}
				</button>
			</div>
			<div v-if="showFieldStats" class="field-stats-grid">
				<div 
					v-for="(count, field) in fieldAnalysis.fieldStats" 
					:key="field" 
					class="field-stat-item"
				>
					<span class="field-name">{{ field }}</span>
					<span class="field-count">{{ count.toLocaleString() }}</span>
				</div>
			</div>
		</div>
		<PivottableUi
			v-if="currentData && currentData.length > 0"
			:data="currentData"
			:rows="rows"
			:cols="cols"
			:vals="vals"
			:aggregatorNames="aggregatorNames"
			:headerFields="[]"
			:validateColumnDrop="validateColumnDrop"
			rendererName="Table"
			:rowTotal="true"
			:colTotal="true"
			:enableVirtualization="true"
			:virtualizationThreshold="100"
			:virtualizationMaxHeight="600"
		/>
	</div>
</template>

<script>
import { ref, shallowRef, watch, computed, nextTick, onMounted, onUnmounted } from "vue";
import PivottableUi from "./PivottableUi.js";
import { countUniqueValuesPerField } from "../utils/fieldAnalyzer.js";
import * as XLSX from "xlsx";

export default {
	name: "App",
	components: {
		PivottableUi,
	},
	setup() {
		const currentData = shallowRef([]);
		const fieldAnalysis = shallowRef(null);
		const rows = shallowRef([]);
		const cols = shallowRef([]);
		const vals = shallowRef([]);
		const aggregatorNames = shallowRef(['Count', 'Sum']);
		const uploading = ref(false);
		const horizontalHeaderCount = ref(0);
		const showFieldStats = ref(true);

		// Trigger file input click
		const triggerFileInput = () => {
			const fileInput = document.getElementById('excel-file-input');
			if (fileInput) {
				fileInput.click();
			}
		};

		// Trigger JSON file input click
		const triggerJsonInput = () => {
			const fileInput = document.getElementById('json-file-input');
			if (fileInput) {
				fileInput.click();
			}
		};

		// Handle Excel file upload
		const handleFileUpload = async (event) => {
			const file = event.target.files?.[0];
			if (!file) {
				return;
			}

			// Check file size (limit to 50MB to prevent crashes)
			const maxSize = 50 * 1024 * 1024; // 50MB
			if (file.size > maxSize) {
				alert(`File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum file size is 50MB.`);
				event.target.value = '';
				return;
			}

			uploading.value = true;
			
			try {
				// Read file as ArrayBuffer
				const arrayBuffer = await file.arrayBuffer();
				
				// Parse Excel file with options to handle large files better
				const workbook = XLSX.read(arrayBuffer, { 
					type: 'array',
					cellDates: true,
					cellNF: false,
					cellStyles: false,
					sheetStubs: false
				});
				
				// Get first sheet
				const firstSheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[firstSheetName];
				
				// Convert to JSON
				const jsonData = XLSX.utils.sheet_to_json(worksheet, {
					raw: false, // Convert dates and numbers to strings for consistency
					defval: null, // Default value for empty cells
					dateNF: 'yyyy-mm-dd' // Date format
				});

				// Limit to 500,000 rows to prevent browser crashes
				const maxRows = 500000;
				if (jsonData.length > maxRows) {
					const proceed = confirm(`The file contains ${jsonData.length.toLocaleString()} rows. Processing more than ${maxRows.toLocaleString()} rows may cause the browser to freeze. Do you want to process only the first ${maxRows.toLocaleString()} rows?`);
					if (!proceed) {
						event.target.value = '';
						uploading.value = false;
						return;
					}
					jsonData.splice(maxRows);
				}

				// Process data in chunks to prevent browser freeze
				const chunkSize = 1000; // Process 1000 rows at a time
				const processedData = [];
				
				// Process first chunk immediately
				for (let i = 0; i < Math.min(chunkSize, jsonData.length); i++) {
					const row = jsonData[i];
					const processedRow = {};
					for (const key in row) {
						let value = row[key];
						
						// Convert empty strings to null
						if (value === '' || value === 'null') {
							value = null;
						}
						// Try to convert numeric strings to numbers
						else if (typeof value === 'string' && value.trim() !== '') {
							const numValue = parseFloat(value);
							if (!isNaN(numValue) && isFinite(numValue) && value.trim() === String(numValue)) {
								value = numValue;
							}
						}
						
						processedRow[key] = value;
					}
					processedData.push(processedRow);
				}

				// Process remaining chunks asynchronously
				if (jsonData.length > chunkSize) {
					await new Promise((resolve) => {
						let currentIndex = chunkSize;
						
						const processChunk = () => {
							const endIndex = Math.min(currentIndex + chunkSize, jsonData.length);
							
							for (let i = currentIndex; i < endIndex; i++) {
								const row = jsonData[i];
								const processedRow = {};
								for (const key in row) {
									let value = row[key];
									
									// Convert empty strings to null
									if (value === '' || value === 'null') {
										value = null;
									}
									// Try to convert numeric strings to numbers
									else if (typeof value === 'string' && value.trim() !== '') {
										const numValue = parseFloat(value);
										if (!isNaN(numValue) && isFinite(numValue) && value.trim() === String(numValue)) {
											value = numValue;
										}
									}
									
									processedRow[key] = value;
								}
								processedData.push(processedRow);
							}
							
							currentIndex = endIndex;
							
							if (currentIndex < jsonData.length) {
								// Yield to browser, then continue
								setTimeout(processChunk, 0);
							} else {
								resolve();
							}
						};
						
						processChunk();
					});
				}

				// CRITICAL: Reset header fields to empty before setting new data
				// This ensures previous file's header configuration doesn't persist
				rows.value = [];
				cols.value = [];
				
				currentData.value = processedData;
				console.log(`✅ Loaded ${processedData.length} records from Excel file: ${file.name}`);
				
				// Reset file input
				event.target.value = '';
				
				// Automatically analyze fields after loading Excel data
				// Analyze unique value counts for all fields
				// Use nextTick to ensure data is fully set, then analyze
				nextTick(() => {
					setTimeout(() => {
						analyzeFields();
					}, 100);
				});
			} catch (error) {
				console.error('Error processing Excel file:', error);
				alert('Failed to process Excel file. Please make sure it is a valid Excel file (.xlsx, .xls) or CSV. Error: ' + error.message);
			} finally {
				uploading.value = false;
			}
		};

		// Handle JSON file upload
		const handleJsonUpload = async (event) => {
			const file = event.target.files?.[0];
			if (!file) {
				return;
			}

			// Check file size (limit to 50MB to prevent crashes)
			const maxSize = 50 * 1024 * 1024; // 50MB
			if (file.size > maxSize) {
				alert(`File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum file size is 50MB.`);
				event.target.value = '';
				return;
			}

			uploading.value = true;

			try {
				// Read file as text
				const fileText = await file.text();
				
				// Parse JSON
				let jsonData;
				try {
					jsonData = JSON.parse(fileText);
				} catch (parseError) {
					throw new Error('Invalid JSON format: ' + parseError.message);
				}

				// Ensure it's an array
				if (!Array.isArray(jsonData)) {
					throw new Error('JSON file must contain an array of objects');
				}

				// Limit to 500,000 rows to prevent browser crashes
				const maxRows = 500000;
				if (jsonData.length > maxRows) {
					const proceed = confirm(`The file contains ${jsonData.length.toLocaleString()} rows. Processing more than ${maxRows.toLocaleString()} rows may cause the browser to freeze. Do you want to process only the first ${maxRows.toLocaleString()} rows?`);
					if (!proceed) {
						event.target.value = '';
						uploading.value = false;
						return;
					}
					jsonData = jsonData.slice(0, maxRows);
				}

				// Process data in chunks to prevent browser freeze
				const chunkSize = 1000; // Process 1000 rows at a time
				const processedData = [];
				
				// Process first chunk immediately
				for (let i = 0; i < Math.min(chunkSize, jsonData.length); i++) {
					const row = jsonData[i];
					const processedRow = {};
					for (const key in row) {
						let value = row[key];
						
						// Convert empty strings to null
						if (value === '' || value === 'null') {
							value = null;
						}
						// Try to convert numeric strings to numbers
						else if (typeof value === 'string' && value.trim() !== '') {
							const numValue = parseFloat(value);
							if (!isNaN(numValue) && isFinite(numValue) && value.trim() === String(numValue)) {
								value = numValue;
							}
						}
						
						processedRow[key] = value;
					}
					processedData.push(processedRow);
				}

				// Process remaining chunks asynchronously
				if (jsonData.length > chunkSize) {
					await new Promise((resolve) => {
						let currentIndex = chunkSize;
						
						const processChunk = () => {
							const endIndex = Math.min(currentIndex + chunkSize, jsonData.length);
							
							for (let i = currentIndex; i < endIndex; i++) {
								const row = jsonData[i];
								const processedRow = {};
								for (const key in row) {
									let value = row[key];
									
									// Convert empty strings to null
									if (value === '' || value === 'null') {
										value = null;
									}
									// Try to convert numeric strings to numbers
									else if (typeof value === 'string' && value.trim() !== '') {
										const numValue = parseFloat(value);
										if (!isNaN(numValue) && isFinite(numValue) && value.trim() === String(numValue)) {
											value = numValue;
										}
									}
									
									processedRow[key] = value;
								}
								processedData.push(processedRow);
							}
							
							currentIndex = endIndex;
							
							if (currentIndex < jsonData.length) {
								// Yield to browser, then continue
								setTimeout(processChunk, 0);
							} else {
								resolve();
							}
						};
						
						processChunk();
					});
				}

				// CRITICAL: Reset header fields to empty before setting new data
				// This ensures previous file's header configuration doesn't persist
				rows.value = [];
				cols.value = [];
				
				currentData.value = processedData;
				console.log(`✅ Loaded ${processedData.length} records from JSON file: ${file.name}`);
				
				// Reset file input
				event.target.value = '';
				
				// Automatically analyze fields after loading JSON data
				// Analyze unique value counts for all fields
				// Use nextTick to ensure data is fully set, then analyze
				nextTick(() => {
					setTimeout(() => {
						analyzeFields();
					}, 100);
				});
			} catch (error) {
				console.error('Error processing JSON file:', error);
				alert('Failed to process JSON file. Please make sure it is a valid JSON file containing an array of objects. Error: ' + error.message);
			} finally {
				uploading.value = false;
			}
		};

		// Calculate data cells count for given column fields
		// This is used to validate if adding a field would exceed the threshold
		const calculateDataCellsCount = (proposedCols) => {
			if (!currentData.value || currentData.value.length === 0) {
				return 0;
			}

			const aggregatorCount = aggregatorNames.value ? aggregatorNames.value.length : 1;
			const colAttrsCount = proposedCols ? proposedCols.length : 0;

			// If there are no column attributes, data cells count is just aggregator count
			if (colAttrsCount === 0) {
				return aggregatorCount;
			}

			// Calculate the number of unique combinations for column fields
			let columnCombinations = 1;
			proposedCols.forEach(colField => {
				const uniqueValues = new Set();
				currentData.value.forEach(record => {
					const value = record[colField];
					if (value === null || value === undefined) {
						uniqueValues.add('null');
					} else {
						uniqueValues.add(String(value));
					}
				});
				columnCombinations *= uniqueValues.size;
			});

			return columnCombinations * aggregatorCount;
		};

		// Validate if adding a field to column headers would exceed the threshold
		// Returns { allowed: boolean, dataCellsCount: number, message?: string }
		const validateColumnDrop = (fieldName, currentCols, newIndex) => {
			// Create a proposed column array with the new field
			const proposedCols = [...(currentCols || [])];
			proposedCols.splice(newIndex, 0, fieldName);
			
			const dataCellsCount = calculateDataCellsCount(proposedCols);
			
			if (dataCellsCount > 200) {
				const aggregatorCount = aggregatorNames.value ? aggregatorNames.value.length : 1;
				const columnCombinations = proposedCols.length > 0 ? dataCellsCount / aggregatorCount : 1;
				const columnFieldsList = proposedCols.join(', ');
				
				// Show the alert
				showHeaderCountAlert(dataCellsCount, columnCombinations, aggregatorCount, columnFieldsList);
				
				return {
					allowed: false,
					dataCellsCount,
					message: `Adding "${fieldName}" would create ${dataCellsCount.toLocaleString()} data cells, which exceeds the limit of 2,000. Please use vertical headers instead.`
				};
			}
			
			return {
				allowed: true,
				dataCellsCount
			};
		};

		// Calculate and update horizontal header count
		// This counts the number of <th> tags in the column header (thead) of the rendered table
		let retryCount = 0;
		const MAX_RETRIES = 20; // Try up to 20 times (2 seconds total)
		const updateHorizontalHeaderCount = () => {
			// Use nextTick to ensure the table is rendered in the DOM
			nextTick(() => {
				// Find the pivot table in the DOM
				const pivotTable = document.querySelector('table.pvtTable');
				
				if (!pivotTable) {
					// Table not rendered yet, try again after a short delay
					if (retryCount < MAX_RETRIES) {
						retryCount++;
						setTimeout(() => {
							updateHorizontalHeaderCount();
						}, 200);
					} else {
						// Max retries reached, reset counter and set count to 0
						// Don't show warning - table might not be rendered yet or might not exist
						retryCount = 0;
						horizontalHeaderCount.value = 0;
					}
					return;
				}
				
				// Reset retry count on success
				retryCount = 0;

				// Find the thead element (column header)
				const thead = pivotTable.querySelector('thead');
				
				if (!thead) {
					// No thead found, count is 0
					horizontalHeaderCount.value = 0;
					return;
				}

				// Find all rows in the thead (column header rows)
				const headerRows = thead.querySelectorAll('tr');
				
				if (headerRows.length === 0) {
					horizontalHeaderCount.value = 0;
					return;
				}

				// Count <th> tags in each header row and find the maximum
				// This represents the longest row in the column header
				let maxThCount = 0;
				headerRows.forEach(row => {
					const thCount = row.querySelectorAll('th').length;
					if (thCount > maxThCount) {
						maxThCount = thCount;
					}
				});

				// Update the horizontal header count with the maximum <th> count in column header
				horizontalHeaderCount.value = maxThCount;

				// Check if we need to show alert based on data cells count
				// We still need to calculate data cells for the alert
				if (!currentData.value || currentData.value.length === 0) {
					return;
				}

				// Use the calculateDataCellsCount function
				const dataCellsCount = calculateDataCellsCount(cols.value);

				console.log('Max <th> count in rendered table:', maxThCount);
				
				// Don't show alert here - validateColumnDrop handles alerts when user tries to add fields
				// This function just updates the count display
			});
		};

		// MutationObserver to watch for changes in the column header (thead) and update count automatically
		let theadObserver = null;
		const setupTheadObserver = () => {
			// Clean up existing observer if any
			if (theadObserver) {
				if (theadObserver.timeoutId) {
					clearTimeout(theadObserver.timeoutId);
				}
				theadObserver.disconnect();
				theadObserver = null;
			}

			// Use nextTick to ensure DOM is ready
			nextTick(() => {
				const pivotTable = document.querySelector('table.pvtTable');
				if (!pivotTable) {
					// Table not rendered yet, try again after a short delay
					setTimeout(() => {
						setupTheadObserver();
					}, 100);
					return;
				}

				const thead = pivotTable.querySelector('thead');
				
				if (thead && !theadObserver) {
					// Create a MutationObserver to watch for changes in the thead
					theadObserver = new MutationObserver((mutations) => {
						// Debounce updates to avoid excessive calculations
						if (theadObserver.timeoutId) {
							clearTimeout(theadObserver.timeoutId);
						}
						theadObserver.timeoutId = setTimeout(() => {
							updateHorizontalHeaderCount();
						}, 50);
					});

					// Start observing the thead for changes
					theadObserver.observe(thead, {
						childList: true,      // Watch for added/removed child elements (rows, cells)
						subtree: true,        // Watch all descendants
						attributes: false,    // Don't watch attribute changes
						characterData: false  // Don't watch text content changes
					});
				}
			});
		};

		// Setup observer when table is rendered (called from watch and other places)
		const setupObserverOnTableRender = () => {
			nextTick(() => {
				setTimeout(() => {
					setupTheadObserver();
				}, 100);
			});
		};

		// Show improved alert for horizontal header count warning
		const showHeaderCountAlert = (totalCells, columnCombinations, aggregatorCount, columnFieldsList) => {
			// Create a custom alert element
			const alertOverlay = document.createElement('div');
			alertOverlay.style.cssText = `
				position: fixed;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				background: rgba(0, 0, 0, 0.5);
				display: flex;
				justify-content: center;
				align-items: center;
				z-index: 10000;
			`;

			const alertBox = document.createElement('div');
			alertBox.style.cssText = `
				background: white;
				border-radius: 12px;
				padding: 24px;
				max-width: 500px;
				box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
				animation: slideIn 0.3s ease-out;
			`;

			// Add animation keyframes
			const style = document.createElement('style');
			style.textContent = `
				@keyframes slideIn {
					from {
						transform: translateY(-20px);
						opacity: 0;
					}
					to {
						transform: translateY(0);
						opacity: 1;
					}
				}
			`;
			document.head.appendChild(style);

			alertBox.innerHTML = `
				<div style="display: flex; align-items: center; margin-bottom: 16px;">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 12px;">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#ff9800"/>
					</svg>
					<h3 style="margin: 0; color: #333; font-size: 18px; font-weight: 600;">Performance Warning</h3>
				</div>
				<div style="color: #666; line-height: 1.6; margin-bottom: 16px;">
					<p style="margin: 0 0 12px 0;">
						The horizontal header row will have <strong style="color: #1976d2;">${totalCells.toLocaleString()} cells</strong>, which may cause performance issues.
					</p>
					<div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 12px; font-size: 13px;">
						<div style="margin-bottom: 4px;"><strong>Column combinations:</strong> ${columnCombinations.toLocaleString()}</div>
						<div style="margin-bottom: 4px;"><strong>Aggregators:</strong> ${aggregatorCount}</div>
						<div><strong>Total header cells:</strong> ${totalCells.toLocaleString()}</div>
					</div>
					<p style="margin: 12px 0 0 0; color: #1976d2; font-weight: 500;">
						💡 Consider using vertical headers (rows) instead of horizontal headers (columns) for better performance.
					</p>
					<p style="margin: 8px 0 0 0; font-size: 13px; color: #999;">
						Current column fields: <strong>${columnFieldsList}</strong>
					</p>
				</div>
				<button id="alert-ok-btn" style="
					width: 100%;
					padding: 12px;
					background: #1976d2;
					color: white;
					border: none;
					border-radius: 6px;
					font-size: 14px;
					font-weight: 500;
					cursor: pointer;
					transition: background 0.2s;
				" onmouseover="this.style.background='#1565c0'" onmouseout="this.style.background='#1976d2'">
					OK, I understand
				</button>
			`;

			alertOverlay.appendChild(alertBox);
			document.body.appendChild(alertOverlay);

			// Close on button click
			const okButton = alertBox.querySelector('#alert-ok-btn');
			okButton.addEventListener('click', () => {
				document.body.removeChild(alertOverlay);
				document.head.removeChild(style);
			});

			// Close on overlay click (outside the box)
			alertOverlay.addEventListener('click', (e) => {
				if (e.target === alertOverlay) {
					document.body.removeChild(alertOverlay);
					document.head.removeChild(style);
				}
			});
		};

		// Generate large dataset for testing
		const generateLargedatasets = () => {
			const numRecords = 100000; // Default number of records
			const data = [];
			
			// Sample data for different fields
			const regions = ['North', 'South', 'East', 'West', 'Central'];
			const products = ['Product A', 'Product B', 'Product C', 'Product D', 'Product E'];
			const categories = ['Category 1', 'Category 2', 'Category 3', 'Category 4'];
			const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
			const years = [2020, 2021, 2022, 2023, 2024];
			const quantities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const sales = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
			const prices = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
			const profits = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
			for (let i = 0; i < numRecords; i++) {
				const record = {
					region: regions[Math.floor(Math.random() * regions.length)],
					product: products[Math.floor(Math.random() * products.length)],
					category: categories[Math.floor(Math.random() * categories.length)],
					month: months[Math.floor(Math.random() * months.length)],
					year: years[Math.floor(Math.random() * years.length)],
					quantity: quantities[Math.floor(Math.random() * quantities.length)],
					sales: sales[Math.floor(Math.random() * sales.length)],
					price: Math.round(prices[Math.floor(Math.random() * prices.length)] * 100) / 100,
					profit: profits[Math.floor(Math.random() * profits.length)],
				};
				data.push(record);
			}
			
			// CRITICAL: Reset header fields to empty before setting new data
			// This ensures previous data's header configuration doesn't persist
			rows.value = [];
			cols.value = [];
			
			// CRITICAL: Reset header fields to empty before setting new data
			// This ensures previous data's header configuration doesn't persist
			rows.value = [];
			cols.value = [];
			
			currentData.value = data;
			console.log(`✅ Generated ${data.length * 3 / 2} records`);
			
			// Automatically analyze fields after generating sample data
			// Analyze unique value counts for all fields
			// Use nextTick to ensure data is fully set, then analyze
			nextTick(() => {
				analyzeFields();
			});
		};

		// Analyze fields - count unique values for each field
		// This function is called automatically after loading Excel, JSON, or generating sample data
		const analyzeFields = () => {
			if (!currentData.value || currentData.value.length === 0) {
				console.warn('No data available for analysis');
				return;
			}

			console.log('\n========== Starting Field Analysis ==========');
			console.log(`Analyzing ${currentData.value.length} records...`);

			// Count unique values for each field in the dataset
			const fieldStats = countUniqueValuesPerField(currentData.value);
			fieldAnalysis.value = { fieldStats };

			console.log('\n========== Field Analysis Results ==========');
			console.log('Unique value counts for each field:');
			for (const field in fieldStats) {
				console.log(`  ${field}: ${fieldStats[field]} unique values`);
			}
			console.log('===========================================\n');

			// Don't automatically set row and column headers
			// Let the user configure them manually
			const allFields = Object.keys(fieldStats);
			// Reset rows and cols to empty arrays
			rows.value = [];
			cols.value = [];

			// Find numeric fields for values
			const numericFields = allFields.filter(field => {
				const sampleValue = currentData.value.find(r => r[field] != null)?.[field];
				return typeof sampleValue === 'number';
			});
			
			// Always set vals and aggregatorNames to ensure table renders
			if (numericFields.length > 0) {
				vals.value = numericFields.slice(0, 2); // Use first 2 numeric fields
				aggregatorNames.value = ['Count', 'Sum'];
			} else {
				// If no numeric fields, use first field as value with Count aggregator
				// This ensures the table will render
				vals.value = [allFields[0]];
				aggregatorNames.value = ['Count'];
			}

			console.log('Pivot Table Configuration:');
			console.log('Rows:', rows.value);
			console.log('Cols:', cols.value);
			console.log('Values:', vals.value);
			console.log('Aggregators:', aggregatorNames.value);

			// Update horizontal header count after configuring columns
			// Use nextTick with a delay to ensure table is fully rendered
			nextTick(() => {
				// Add a delay to ensure the table component has fully rendered
				setTimeout(() => {
					updateHorizontalHeaderCount();
					setupObserverOnTableRender();
				}, 300);
			});
		};

		// Watch for configuration changes and update horizontal header count
		// Since rows and cols are shallowRef, we need to watch them carefully to detect mutations
		// Watch the array reference, length, and contents to catch all changes
		watch(
			() => {
				// Create a dependency on the array contents by accessing them
				if (rows.value) {
					rows.value.forEach(() => {}); // Touch each element
				}
				if (cols.value) {
					cols.value.forEach(() => {}); // Touch each element
				}
				// Return a string representation to force reactivity
				return {
					rowsLength: rows.value?.length ?? 0,
					colsLength: cols.value?.length ?? 0,
					rowsContent: rows.value?.join(',') ?? '',
					colsContent: cols.value?.join(',') ?? '',
					aggregatorCount: aggregatorNames.value?.length ?? 0,
					dataLength: currentData.value?.length ?? 0
				};
			},
			(newVal, oldVal) => {
				// Use nextTick to ensure the update happens after DOM updates from drag-and-drop
				nextTick(() => {
					updateHorizontalHeaderCount();
					// Setup observer if table is rendered
					setupObserverOnTableRender();
				});
			},
			{ immediate: true, deep: true }
		);
		
		// Also call updateHorizontalHeaderCount immediately if data is already loaded
		// This ensures the count is calculated on initial render if data exists
		if (currentData.value && currentData.value.length > 0) {
			nextTick(() => {
				updateHorizontalHeaderCount();
				setupObserverOnTableRender();
			});
		}

		// Setup thead observer when component is mounted
		onMounted(() => {
			// Wait a bit for the table to render, then setup observer
			setTimeout(() => {
				setupTheadObserver();
			}, 200);
		});

		// Clean up observer when component is unmounted
		onUnmounted(() => {
			if (theadObserver) {
				if (theadObserver.timeoutId) {
					clearTimeout(theadObserver.timeoutId);
				}
				theadObserver.disconnect();
				theadObserver = null;
			}
		});
		
		return {
			currentData,
			fieldAnalysis,
			rows,
			cols,
			vals,
			aggregatorNames,
			uploading,
			horizontalHeaderCount,
			showFieldStats,
			triggerFileInput,
			triggerJsonInput,
			handleFileUpload,
			handleJsonUpload,
			generateLargedatasets,
			validateColumnDrop,
		};
	},
};
</script>

<style scoped>
.app-container {
	padding: 24px;
}

.controls {
	margin-bottom: 24px;
	padding: 16px;
	background: #f5f5f5;
	border-radius: 8px;
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.controls label {
	font-weight: 500;
	color: #333;
}

.controls input[type="number"] {
	padding: 8px 12px;
	border: 1px solid #ddd;
	border-radius: 4px;
	font-size: 14px;
	width: 120px;
}

.controls button {
	padding: 8px 16px;
	background: #1976d2;
	color: white;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 500;
	transition: background 0.2s;
}

.controls button:hover {
	background: #1565c0;
}

.controls button:active {
	background: #0d47a1;
}

.info {
	color: #666;
	font-size: 14px;
	margin-left: auto;
}

.field-analysis {
	margin-top: 16px;
	padding: 16px;
	background: white;
	border-radius: 8px;
	border: 1px solid #ddd;
	width: 100%;
}

.analysis-section {
	margin-bottom: 16px;
}

.analysis-section:last-child {
	margin-bottom: 0;
}

.analysis-section strong {
	display: block;
	margin-bottom: 8px;
	color: #333;
	font-size: 14px;
}

.field-count {
	margin-left: 8px;
	color: #1976d2;
	font-weight: 600;
}

.field-list {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 8px;
}

.field-tag {
	padding: 4px 12px;
	background: #e3f2fd;
	color: #1976d2;
	border-radius: 16px;
	font-size: 12px;
	font-weight: 500;
}

.field-tag.aggregation {
	background: #fff3e0;
	color: #f57c00;
}

.file-input-label {
	display: inline-block;
}

.upload-status {
	color: #1976d2;
	font-size: 14px;
	font-weight: 500;
	margin-left: 8px;
}

.field-stats-container {
	margin-bottom: 16px;
	padding: 12px;
	background: white;
	border-radius: 6px;
	border: 1px solid #ddd;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.field-stats-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 10px;
}

.field-stats-title {
	margin: 0;
	color: #333;
	font-size: 14px;
	font-weight: 600;
	border-bottom: 1px solid #1976d2;
	padding-bottom: 6px;
	flex: 1;
}

.field-stats-toggle {
	background: #1976d2;
	color: white;
	border: none;
	border-radius: 4px;
	padding: 4px 8px;
	font-size: 12px;
	cursor: pointer;
	transition: background 0.2s;
	margin-left: 8px;
	min-width: 28px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.field-stats-toggle:hover {
	background: #1565c0;
}

.field-stats-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 6px;
}

.field-stat-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 6px 10px;
	background: #f8f9fa;
	border-radius: 4px;
	border-left: 3px solid #1976d2;
	transition: all 0.15s;
}

.field-stat-item:hover {
	background: #e3f2fd;
	transform: translateX(1px);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.field-name {
	font-weight: 500;
	color: #333;
	font-size: 11px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1;
	margin-right: 8px;
}

.field-count {
	color: #1976d2;
	font-weight: 600;
	font-size: 11px;
	white-space: nowrap;
}
</style>

