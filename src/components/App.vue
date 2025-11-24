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
			<button @click="loadExcelData">Load Sample Data</button>
			<button @click="analyzeFields">Analyze Fields</button>
			<span class="info">Current dataset size: {{ currentData?.length || 0 }} records</span>
			<span v-if="uploading" class="upload-status">Processing file...</span>
			<div v-if="fieldAnalysis" class="field-analysis">
				<div class="analysis-section">
					<strong>Header Fields (≤50 unique values):</strong>
					<span class="field-count">{{ fieldAnalysis.headerFields.length }}</span>
					<div class="field-list">
						<span v-for="field in fieldAnalysis.headerFields" :key="field" class="field-tag">
							{{ field }} ({{ fieldAnalysis.fieldStats[field] }})
						</span>
					</div>
				</div>
				<div class="analysis-section">
					<strong>Aggregation Fields (>50 unique values):</strong>
					<span class="field-count">{{ fieldAnalysis.aggregationFields.length }}</span>
					<div class="field-list">
						<span v-for="field in fieldAnalysis.aggregationFields" :key="field" class="field-tag aggregation">
							{{ field }} ({{ fieldAnalysis.fieldStats[field] }})
						</span>
					</div>
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
			:headerFields="fieldAnalysis ? fieldAnalysis.headerFields : []"
			rendererName="Table"
			:rowTotal="true"
			:colTotal="true"
		/>
	</div>
</template>

<script>
import { ref, shallowRef } from "vue";
import PivottableUi from "./PivottableUi.js";
import { categorizeFields } from "../utils/fieldAnalyzer.js";
import * as XLSX from "xlsx";

export default {
	name: "App",
	components: {
		PivottableUi,
	},
	setup() {
		const currentData = shallowRef([]);
		const fieldAnalysis = ref(null);
		const rows = ref([]);
		const cols = ref([]);
		const vals = ref([]);
		const aggregatorNames = ref(['Count', 'Sum']);
		const uploading = ref(false);

		// Trigger file input click
		const triggerFileInput = () => {
			const fileInput = document.getElementById('excel-file-input');
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

			uploading.value = true;
			
			try {
				// Read file as ArrayBuffer
				const arrayBuffer = await file.arrayBuffer();
				
				// Parse Excel file
				const workbook = XLSX.read(arrayBuffer, { type: 'array' });
				
				// Get first sheet
				const firstSheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[firstSheetName];
				
				// Convert to JSON
				const jsonData = XLSX.utils.sheet_to_json(worksheet, {
					raw: false, // Convert dates and numbers to strings for consistency
					defval: null, // Default value for empty cells
					dateNF: 'yyyy-mm-dd' // Date format
				});

				// Process the data: convert numeric strings to numbers and handle nulls
				const processedData = jsonData.map(row => {
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
					return processedRow;
				});

				currentData.value = processedData;
				console.log(`✅ Loaded ${processedData.length} records from Excel file: ${file.name}`);
				
				// Reset file input
				event.target.value = '';
				
				// Automatically analyze fields after loading
				analyzeFields();
			} catch (error) {
				console.error('Error processing Excel file:', error);
				alert('Failed to process Excel file. Please make sure it is a valid Excel file (.xlsx, .xls) or CSV. Error: ' + error.message);
			} finally {
				uploading.value = false;
			}
		};

		// Load Excel JSON data (sample data)
		const loadExcelData = async () => {
			try {
				const response = await fetch('/excel-data.json');
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const data = await response.json();
				currentData.value = data;
				console.log(`✅ Loaded ${data.length} records from Excel data`);
				
				// Automatically analyze fields after loading
				analyzeFields();
			} catch (error) {
				console.error('Error loading Excel data:', error);
				alert('Failed to load Excel data. Please check if excel-data.json exists in the public folder. Error: ' + error.message);
			}
		};

		// Analyze fields and categorize them
		const analyzeFields = () => {
			if (!currentData.value || currentData.value.length === 0) {
				console.warn('No data available for analysis');
				return;
			}

			const analysis = categorizeFields(currentData.value, 50);
			fieldAnalysis.value = analysis;

			console.log('\n========== Field Analysis ==========');
			console.log('Header Fields (≤50 unique values):', analysis.headerFields);
			console.log('Aggregation Fields (>50 unique values):', analysis.aggregationFields);
			console.log('Field Statistics:', analysis.fieldStats);
			console.log('=====================================\n');

			// Automatically configure pivot table
			// Use first few header fields for rows and cols
			// Use aggregation fields for values
			if (analysis.headerFields.length > 0) {
				// Set first header field as row, second as col (if available)
				rows.value = [analysis.headerFields[0]];
				if (analysis.headerFields.length > 1) {
					cols.value = [analysis.headerFields[1]];
				} else {
					cols.value = [];
				}
			}

			if (analysis.aggregationFields.length > 0) {
				// Use all aggregation fields as values
				vals.value = analysis.aggregationFields;
				// Set default aggregators
				aggregatorNames.value = ['Count', 'Sum'];
			} else {
				// Fallback: if no aggregation fields, use numeric fields from header fields
				const numericFields = analysis.headerFields.filter(field => {
					const sampleValue = currentData.value.find(r => r[field] != null)?.[field];
					return typeof sampleValue === 'number';
				});
				if (numericFields.length > 0) {
					vals.value = numericFields.slice(0, 2); // Use first 2 numeric fields
				}
			}

			console.log('Pivot Table Configuration:');
			console.log('Rows:', rows.value);
			console.log('Cols:', cols.value);
			console.log('Values:', vals.value);
			console.log('Aggregators:', aggregatorNames.value);
		};
		
		return {
			currentData,
			fieldAnalysis,
			rows,
			cols,
			vals,
			aggregatorNames,
			uploading,
			triggerFileInput,
			handleFileUpload,
			loadExcelData,
			analyzeFields,
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
</style>

