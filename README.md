# Vue 3 Pivot Table

A powerful, feature-rich pivot table component for Vue 3 with support for large datasets, Excel/JSON file uploads, and multiple visualization options.

## Features

- 📊 **Interactive Pivot Tables** - Drag-and-drop interface for creating pivot tables
- 📈 **Multiple Visualizations** - Table, Heatmap, Bar Chart, Line Chart, Pie Chart, and more
- 📁 **File Upload Support** - Upload Excel (.xlsx, .xls, .csv) and JSON files
- ⚡ **Performance Optimized** - Web Workers for large datasets, virtualization for large tables
- 🎨 **Customizable** - Extensive styling options and configuration
- 🌐 **Frappe Framework Support** - Built-in support for Frappe Framework integration
- 🔄 **Real-time Updates** - Reactive data updates with Vue 3 Composition API

## Installation

```bash
npm install vue3-pivottable
```

## Quick Start

### Basic Usage

```vue
<template>
  <PivottableUi
    :data="data"
    :rows="rows"
    :cols="cols"
    :vals="vals"
    :aggregatorNames="aggregatorNames"
    rendererName="Table"
  />
</template>

<script setup>
import { ref } from 'vue';
import PivottableUi from 'vue3-pivottable';

const data = ref([
  { region: 'North', product: 'A', sales: 100 },
  { region: 'South', product: 'B', sales: 200 },
  // ... more data
]);

const rows = ref(['region']);
const cols = ref(['product']);
const vals = ref(['sales']);
const aggregatorNames = ref(['Sum']);
</script>
```

### Using Composables

```vue
<template>
  <PivottableUi
    :data="pivotTable.data.value"
    :rows="pivotTable.rows.value"
    :cols="pivotTable.cols.value"
    :vals="pivotTable.vals.value"
    :aggregatorNames="pivotTable.aggregatorNames.value"
    rendererName="Table"
  />
</template>

<script setup>
import { usePivotTable, useFileUpload } from 'vue3-pivottable/composables';

const pivotTable = usePivotTable({
  initialData: [],
  initialRows: ['region'],
  initialCols: ['product'],
  initialVals: ['sales'],
  initialAggregatorNames: ['Sum'],
});

const fileUpload = useFileUpload({
  onComplete: (data) => {
    pivotTable.setData(data);
  },
});
</script>
```

## API Reference

### Components

#### PivottableUi

Main pivot table UI component with drag-and-drop interface.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `Array` | `[]` | Array of data objects |
| `rows` | `Array` | `[]` | Array of field names for row headers |
| `cols` | `Array` | `[]` | Array of field names for column headers |
| `vals` | `Array` | `[]` | Array of field names for values |
| `aggregatorNames` | `Array` | `['Count', 'Sum']` | Array of aggregator names |
| `rendererName` | `String` | `'Table'` | Renderer name (Table, Table Heatmap, Bar Chart, etc.) |
| `rowTotal` | `Boolean` | `true` | Show row totals |
| `colTotal` | `Boolean` | `true` | Show column totals |
| `enableVirtualization` | `Boolean` | `false` | Enable table virtualization |
| `virtualizationThreshold` | `Number` | `100` | Row count threshold for virtualization |
| `virtualizationMaxHeight` | `Number` | `600` | Maximum height for virtualized table |

**Methods:**

- `toggleControlPanel()` - Toggle control panel visibility

### Composables

#### usePivotTable

Composable for managing pivot table state.

```javascript
import { usePivotTable } from 'vue3-pivottable/composables';

const {
  data,
  rows,
  cols,
  vals,
  aggregatorNames,
  showControlPanel,
  hasData,
  dataSize,
  setData,
  setRows,
  setCols,
  setVals,
  setAggregatorNames,
  toggleControlPanel,
  reset,
  getConfig,
  setConfig,
} = usePivotTable({
  initialData: [],
  initialRows: [],
  initialCols: [],
  initialVals: [],
  initialAggregatorNames: ['Count', 'Sum'],
});
```

#### useFileUpload

Composable for handling file uploads.

```javascript
import { useFileUpload } from 'vue3-pivottable/composables';

const {
  uploading,
  uploadProgress,
  uploadError,
  handleFileUpload,
  processExcelFile,
  processJsonFile,
  validateFileSize,
  reset,
} = useFileUpload({
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxRows: 500000,
  onProgress: (progress) => console.log(progress),
  onComplete: (data) => console.log('Upload complete', data),
  onError: (error) => console.error('Upload error', error),
});
```

#### useFieldAnalysis

Composable for analyzing data fields.

```javascript
import { useFieldAnalysis } from 'vue3-pivottable/composables';

const {
  fieldAnalysis,
  fieldStats,
  headerFields,
  aggregationFields,
  hasAnalysis,
  totalFields,
  analyzeFields,
  getNumericFields,
  getFieldStat,
  isHeaderField,
  isAggregationField,
  reset,
} = useFieldAnalysis({
  threshold: 50,
});
```

### Helpers

#### Data Helpers

```javascript
import {
  deepClone,
  getUniqueValues,
  getUniqueFieldValues,
  filterByField,
  groupByField,
  sortByField,
  getFieldNames,
  getNumericFields,
  calculateFieldStatistics,
  transformFields,
  removeNullValues,
} from 'vue3-pivottable/helpers';
```

#### Format Helpers

```javascript
import {
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatDate,
  formatFileSize,
  truncateText,
  capitalize,
  toTitleCase,
  formatValue,
} from 'vue3-pivottable/helpers';
```

#### Validation Helpers

```javascript
import {
  isValidNumber,
  isValidEmail,
  isValidUrl,
  isNotEmpty,
  isInRange,
  hasMinLength,
  hasMaxLength,
  validatePivotData,
  validateFileType,
  validateFileSize,
} from 'vue3-pivottable/helpers';
```

#### DOM Helpers

```javascript
import {
  getElement,
  getElements,
  waitForElement,
  getBoundingRect,
  scrollIntoView,
  addEventListener,
  setStyle,
  getComputedStyle,
  addClass,
  removeClass,
  toggleClass,
  hasClass,
  observeElement,
} from 'vue3-pivottable/helpers';
```

#### Array Helpers

```javascript
import {
  chunk,
  flatten,
  unique,
  groupBy,
  sortBy,
  take,
  takeLast,
  skip,
  skipLast,
  partition,
  zip,
  shuffle,
  intersection,
  difference,
  union,
} from 'vue3-pivottable/helpers';
```

## Renderers

The component supports multiple renderers:

- **Table** - Standard pivot table
- **Table Heatmap** - Table with color-coded cells
- **Table Col Heatmap** - Column-based heatmap
- **Table Row Heatmap** - Row-based heatmap
- **Bar Chart** - Bar chart visualization
- **Line Chart Straight** - Straight line chart
- **Line Chart Curved** - Curved line chart
- **Pie Chart** - Pie chart visualization
- **Export** - Export functionality

## Aggregators

Available aggregators:

- **Count** - Count of records
- **Count Unique Values** - Count of unique values
- **List Unique Values** - List of unique values
- **Sum** - Sum of values
- **Integer Sum** - Sum as integer
- **Average** - Average of values
- **Median** - Median value
- **Sample Variance** - Sample variance
- **Sample Standard Deviation** - Sample standard deviation
- **Minimum** - Minimum value
- **Maximum** - Maximum value
- **First** - First value
- **Last** - Last value
- **Sum over Sum** - Sum divided by sum
- **Sum as Fraction of Total** - Sum as fraction of total
- **Sum as Fraction of Rows** - Sum as fraction of rows
- **Sum as Fraction of Columns** - Sum as fraction of columns
- **Count as Fraction of Total** - Count as fraction of total
- **Count as Fraction of Rows** - Count as fraction of rows
- **Count as Fraction of Columns** - Count as fraction of columns

## Performance

### Large Datasets

The component is optimized for large datasets:

- **Web Workers** - Excel processing runs in background workers
- **Virtualization** - Large tables use virtual scrolling
- **Debounced Updates** - UI updates are debounced for performance
- **LRU Caching** - Calculation results are cached

### Configuration

```vue
<PivottableUi
  :data="data"
  :enableVirtualization="true"
  :virtualizationThreshold="50"
  :virtualizationMaxHeight="600"
/>
```

## File Upload

### Excel Files

Supports `.xlsx`, `.xls`, and `.csv` files:

```javascript
const fileUpload = useFileUpload({
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxRows: 500000,
  onComplete: (data) => {
    pivotTable.setData(data);
  },
});

// Handle file input
const handleFileChange = async (event) => {
  const file = event.target.files[0];
  if (file) {
    const data = await fileUpload.handleFileUpload(file);
    // Data is automatically passed to onComplete callback
  }
};
```

### JSON Files

Supports JSON files with array of objects:

```javascript
const fileUpload = useFileUpload({
  onComplete: (data) => {
    pivotTable.setData(data);
  },
});
```

## Styling

The component includes default styles but can be customized:

```css
/* Override default styles */
.pvtUi {
  /* Your custom styles */
}

.pvtTable {
  /* Your custom table styles */
}
```

## Frappe Framework Integration

For Frappe Framework integration, use the Frappe-specific entry point:

```javascript
import PivottableUi from 'vue3-pivottable/frappe';
```

This includes:
- Frappe number formatting
- Frappe translation support
- Frappe-specific styling

## Examples

### Basic Example

```vue
<template>
  <div>
    <PivottableUi
      :data="data"
      :rows="rows"
      :cols="cols"
      :vals="vals"
      :aggregatorNames="aggregatorNames"
      rendererName="Table"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import PivottableUi from 'vue3-pivottable';

const data = ref([
  { region: 'North', product: 'A', sales: 100, quantity: 10 },
  { region: 'South', product: 'B', sales: 200, quantity: 20 },
  { region: 'East', product: 'A', sales: 150, quantity: 15 },
  { region: 'West', product: 'B', sales: 250, quantity: 25 },
]);

const rows = ref(['region']);
const cols = ref(['product']);
const vals = ref(['sales', 'quantity']);
const aggregatorNames = ref(['Sum']);
</script>
```

### With File Upload

```vue
<template>
  <div>
    <input type="file" @change="handleFileChange" accept=".xlsx,.xls,.csv,.json" />
    <div v-if="fileUpload.uploading.value">
      Uploading... {{ fileUpload.uploadProgress.value }}%
    </div>
    <PivottableUi
      v-if="pivotTable.hasData.value"
      :data="pivotTable.data.value"
      :rows="pivotTable.rows.value"
      :cols="pivotTable.cols.value"
      :vals="pivotTable.vals.value"
      :aggregatorNames="pivotTable.aggregatorNames.value"
      rendererName="Table"
    />
  </div>
</template>

<script setup>
import { usePivotTable, useFileUpload, useFieldAnalysis } from 'vue3-pivottable/composables';
import PivottableUi from 'vue3-pivottable';

const pivotTable = usePivotTable();
const fileUpload = useFileUpload({
  onComplete: (data) => {
    pivotTable.setData(data);
    fieldAnalysis.analyzeFields(data);
  },
});
const fieldAnalysis = useFieldAnalysis();

const handleFileChange = async (event) => {
  const file = event.target.files[0];
  if (file) {
    try {
      await fileUpload.handleFileUpload(file);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }
};
</script>
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.

