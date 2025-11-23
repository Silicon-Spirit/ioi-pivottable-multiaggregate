<template>
	<div class="app-container">
		<div class="controls">
			<label for="dataset-count">Dataset Count:</label>
			<input
				id="dataset-count"
				type="number"
				v-model.number="datasetCount"
				min="1"
				max="150000"
				@input="generateData"
			/>
			<button @click="generateData">Generate Data</button>
			<span class="info">Current dataset size: {{ currentData.length }} records</span>
		</div>
		<PivottableUi
			:data="currentData"
			:rows="['Department']"
			:cols="['Quarter']"
			:vals="['Amount']"
			:aggregatorNames="['Count', 'Sum']"
			rendererName="Table"
			:rowTotal="true"
			:colTotal="true"
		/>
	</div>
</template>

<script>
import { ref } from "vue";
import PivottableUi from "./PivottableUi.js";

// Function to generate large datasets
function generateLargeDataset(count) {
	const departments = ["Sales", "Support", "Marketing"];
	const regions = ["North", "South", "East", "West"];
	const products = ["Software", "Hardware", "Advertising"];
	const quarters = ["Q1", "Q2", "Q3", "Q4"];
	const amounts = ["12", "34", "32", "68", "46.78", "89.09"];
	const parts = ["1", "2", "3", "4", "9", "10"];
	const quantities = ["124", "224", "724", "824", "924", "10"];
	const dates = ["2021-01-01", "2021-01-02", "2021-01-03", "2021-01-04"];
	const times = ["10:00:00", "11:00:00", "12:00:00", "16:00:00"];
	const dataset = [];
	
	for (let i = 0; i < count; i++) {
		if (i % 2 === 0) {
			dataset.push({
				Department: departments[Math.floor(Math.random() * departments.length)],
				Region: regions[Math.floor(Math.random() * regions.length)],
				Product: products[Math.floor(Math.random() * products.length)],
				Time: times[Math.floor(Math.random() * times.length)],
				Amount: amounts[Math.floor(Math.random() * amounts.length)]
			});
		} else {
			dataset.push({
				Department: departments[Math.floor(Math.random() * departments.length)],
				Region: regions[Math.floor(Math.random() * regions.length)],
				Product: products[Math.floor(Math.random() * products.length)],
				Quarter: quarters[Math.floor(Math.random() * quarters.length)],
				Amount: amounts[Math.floor(Math.random() * amounts.length)],
				Part: parts[Math.floor(Math.random() * parts.length)],
				Quantity: quantities[Math.floor(Math.random() * quantities.length)],
				Date: dates[Math.floor(Math.random() * dates.length)],
				Time: times[Math.floor(Math.random() * times.length)],
			});
		}
	}
	return dataset;
}

export default {
	name: "App",
	components: {
		PivottableUi,
	},
	setup() {
		const datasetCount = ref(150000);
		const currentData = ref(generateLargeDataset(150000));
		
		const generateData = () => {
			const count = Math.max(1, Math.min(150000, datasetCount.value || 100));
			
			// Measure dataset generation time
			const genStartTime = performance.now();
			currentData.value = generateLargeDataset(count);
			const genEndTime = performance.now();
			const genDuration = genEndTime - genStartTime;
			
			console.log(`\n========== Performance Metrics ==========`);
			console.log(`[Performance] Dataset Generation: ${genDuration.toFixed(2)}ms for ${count} records`);
			console.log(`[Performance] Generation Rate: ${(count / genDuration * 1000).toFixed(0)} records/sec`);
			console.log(`==========================================\n`);
		};
		
		return {
			datasetCount,
			currentData,
			generateData,
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
</style>

