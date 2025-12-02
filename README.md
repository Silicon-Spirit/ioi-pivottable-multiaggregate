# Vue3 PivotTable for Frappe Framework

A powerful and flexible pivot table component built with Vue 3, designed specifically for use in Frappe Framework applications.

## Features

- 🎯 **Drag & Drop Interface**: Intuitive drag-and-drop interface for configuring pivot tables
- 📊 **Multiple Renderers**: Support for tables, heatmaps, and various chart types (bar, line, pie, percentage)
- 🔢 **Rich Aggregators**: Count, sum, average, median, min, max, and many more aggregation functions
- 🎨 **Customizable**: Highly customizable with support for custom renderers and aggregators
- 🌐 **Frappe Integration**: Built-in integration with Frappe's number formatting and translation system
- 📤 **Export Support**: Export pivot tables to XLSX format
- 🎛️ **Filtering**: Advanced filtering capabilities for rows and columns

## Project Structure

```
vue3-pivottable/
├── src/
│   ├── components/          # Vue components
│   │   ├── Pivottable.js    # Core pivot table component
│   │   ├── PivottableUi.js  # UI component with drag-and-drop
│   │   ├── TableRenderer.js # Renderers (table, charts, export)
│   │   ├── DraggableAttribute.js
│   │   └── Dropdown.js
│   ├── composables/         # Vue 3 Composition API composables
│   │   ├── usePivotData.js  # Data management composable
│   │   ├── usePivotConfig.js # Configuration management composable
│   │   ├── useExcelUpload.js # Excel upload composable
│   │   └── index.js         # Composables export
│   ├── helpers/             # Helper utilities
│   │   ├── dataTransformers.js # Data transformation utilities
│   │   ├── validators.js    # Validation utilities
│   │   ├── formatters.js    # Formatting utilities
│   │   └── index.js         # Helpers export
│   ├── utils/               # Core utility functions
│   │   ├── defaultProps.js
│   │   ├── utils.js
│   │   ├── pivotEngine.js
│   │   └── ...
│   ├── styles/              # Stylesheets
│   │   └── pivottable.css
│   └── entry/               # Entry points
│       ├── index.js         # Main entry point
│       └── frappe.js       # Frappe-specific entry point
├── dist/                    # Build output
├── vite.config.js          # Vite configuration
├── vite.frappe.config.js   # Frappe build configuration
└── package.json
```

## Installation

```bash
npm install vue3-pivottable
```

## Dependencies

- Vue 3.x (peer dependency)
- vuedraggable (for drag and drop functionality)
- xlsx (for Excel export)

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Preview build
npm run preview
```

## Usage

### Basic Example

```javascript
import { createApp } from 'vue';
import { PivottableUi } from 'vue3-pivottable';
import 'vue3-pivottable/style';

const app = createApp({
  data() {
    return {
      data: [
        { color: "blue", shape: "circle", size: 10 },
        { color: "red", shape: "square", size: 20 },
        { color: "blue", shape: "triangle", size: 15 },
        // ... more data
      ],
      rows: ['color'],
      cols: ['shape'],
      aggregatorName: 'Count',
      rendererName: 'Table'
    };
  },
  template: `
    <PivottableUi
      :data="data"
      :rows="rows"
      :cols="cols"
      :aggregatorName="aggregatorName"
      :rendererName="rendererName"
    />
  `
});

app.component('PivottableUi', PivottableUi);
app.mount('#app');
```

### With Frappe Framework

#### Option 1: Using the Frappe Entry Point

```javascript
// In your Frappe app's JS file
import VuePivottable from 'vue3-pivottable/frappe';
import 'vue3-pivottable/style';

// Register the plugin
if (window.Vue) {
  window.Vue.use(VuePivottable);
}

// Or use components directly
import { PivottableUi } from 'vue3-pivottable/frappe';
```

#### Option 2: Manual Integration

```javascript
import { PivottableUi } from 'vue3-pivottable';
import 'vue3-pivottable/style';

// In your Frappe app
frappe.ui.form.on('Your DocType', {
  refresh(frm) {
    if (!frm.pivot_table) {
      frm.pivot_table = frappe.ui.form.make_control({
        parent: frm.fields_dict.your_field.wrapper,
        df: {
          fieldtype: 'HTML',
          options: '<div id="pivot-container"></div>'
        }
      });
      
      // Create Vue app
      const { createApp } = Vue;
      const app = createApp({
        data() {
          return {
            data: frm.doc.your_data || [],
            rows: [],
            cols: [],
            aggregatorName: __('Count'),
            rendererName: __('Table')
          };
        }
      });
      
      app.component('PivottableUi', PivottableUi);
      app.mount('#pivot-container');
    }
  }
});
```

## Components

### PivottableUi

The main UI component with drag-and-drop interface.

**Props:**
- `data` (Array/Object/Function, required): The data to pivot
- `rows` (Array): Array of attribute names for rows
- `cols` (Array): Array of attribute names for columns
- `vals` (Array): Array of attribute names for values
- `aggregatorName` (String): Name of the aggregator to use
- `rendererName` (String): Name of the renderer to use
- `rowTotal` (Boolean): Show row totals (default: true)
- `colTotal` (Boolean): Show column totals (default: true)
- `valueFilter` (Object): Filter values by attribute
- `sorters` (Object/Function): Custom sorters for attributes
- `derivedAttributes` (Object): Custom derived attributes
- `hiddenAttributes` (Array): Attributes to hide from UI
- `hiddenFromAggregators` (Array): Attributes hidden from aggregator selection
- `hiddenFromDragDrop` (Array): Attributes hidden from drag-drop
- `sortonlyFromDragDrop` (Array): Attributes that can only be sorted, not dragged
- `disabledFromDragDrop` (Array): Attributes disabled from drag-drop
- `menuLimit` (Number): Maximum number of items in filter menu (default: 500)

### Pivottable

The core pivot table component without UI controls.

**Props:** Same as PivottableUi, but without UI-specific props.

## Renderers

Available renderers:
- **Table**: Standard table view
- **Table Heatmap**: Full heatmap coloring
- **Table Col Heatmap**: Column-based heatmap
- **Table Row Heatmap**: Row-based heatmap
- **Bar Chart**: Bar chart visualization
- **Line Chart Straight**: Straight line chart
- **Line Chart Curved**: Curved line chart
- **Pie Chart**: Pie chart visualization
- **Percentage Chart**: Percentage chart
- **Export**: Export to XLSX

## Aggregators

Available aggregators:
- Count
- Count Unique Values
- List Unique Values
- Sum
- Integer Sum
- Average
- Median
- Sample Variance
- Sample Standard Deviation
- Minimum
- Maximum
- First
- Last
- Sum over Sum
- Sum as Fraction of Total
- Sum as Fraction of Rows
- Sum as Fraction of Columns
- Count as Fraction of Total
- Count as Fraction of Rows
- Count as Fraction of Columns

## Composables

Vue3 PivotTable provides composables (Vue 3 Composition API) for managing pivot table state and functionality. These composables make it easy to integrate pivot tables into your Vue 3 applications.

### usePivotData

Manages pivot table data, field analysis, and data transformation.

```javascript
import { usePivotData } from 'vue3-pivottable/composables';

const {
  data,              // Reactive data ref
  fields,            // Computed array of field names
  fieldStats,        // Reactive field statistics
  isLoading,         // Loading state
  error,             // Error state
  rowCount,          // Computed row count
  isArrayOfArrays,   // Computed: true if data is array of arrays
  loadData,          // Function to load data
  analyzeFields,     // Function to analyze fields
  clearData,         // Function to clear data
  getFieldStats,     // Get statistics for a field
  hasField,          // Check if field exists
  getFieldSamples,   // Get sample values for a field
} = usePivotData({
  initialData: null,  // Optional initial data
  autoAnalyze: true,  // Auto-analyze fields on data change
});
```

**Example:**

```javascript
import { usePivotData } from 'vue3-pivottable/composables';

export default {
  setup() {
    const { data, fields, fieldStats, loadData, analyzeFields } = usePivotData();

    // Load data
    loadData([
      { name: 'John', age: 30, city: 'NYC' },
      { name: 'Jane', age: 25, city: 'LA' },
    ]);

    // Analyze fields
    await analyzeFields();
    console.log(fieldStats.value); // { name: { unique: 2 }, age: { unique: 2 }, ... }

    return { data, fields, fieldStats };
  }
};
```

### usePivotConfig

Manages pivot table configuration (rows, columns, values, aggregators, renderers).

```javascript
import { usePivotConfig } from 'vue3-pivottable/composables';

const {
  rows,              // Reactive array of row attributes
  cols,              // Reactive array of column attributes
  vals,              // Reactive array of value attributes
  aggregatorNames,   // Reactive array of aggregator names
  rendererName,      // Reactive renderer name
  showRowTotal,      // Reactive boolean for row totals
  showColTotal,      // Reactive boolean for column totals
  valueFilter,       // Reactive value filter object
  sorters,           // Reactive sorters object
  derivedAttributes, // Reactive derived attributes object
  configHash,        // Computed configuration hash
  hasActiveFields,   // Computed: true if any fields are active
  updateConfig,      // Update configuration
  resetConfig,       // Reset to initial configuration
  addRow,            // Add field to rows
  removeRow,         // Remove field from rows
  addCol,            // Add field to columns
  removeCol,         // Remove field from columns
  addVal,            // Add field to values
  removeVal,         // Remove field from values
  getConfig,         // Get current configuration
  exportConfig,      // Export config as JSON
  importConfig,      // Import config from JSON
} = usePivotConfig({
  initialRows: [],
  initialCols: [],
  initialVals: [],
  initialAggregatorNames: ['Count'],
  initialRendererName: 'Table',
  rowTotal: true,
  colTotal: true,
});
```

**Example:**

```javascript
import { usePivotConfig } from 'vue3-pivottable/composables';

export default {
  setup() {
    const { rows, cols, vals, updateConfig, exportConfig } = usePivotConfig();

    // Update configuration
    updateConfig({
      rows: ['region'],
      cols: ['product'],
      vals: ['sales'],
      aggregatorNames: ['Sum'],
    });

    // Export configuration
    const configJson = exportConfig();
    console.log(configJson);

    return { rows, cols, vals };
  }
};
```

### useExcelUpload

Handles Excel file uploads with progress tracking and Web Worker support.

```javascript
import { useExcelUpload } from 'vue3-pivottable/composables';

const {
  uploading,         // Reactive uploading state
  uploadProgress,    // Reactive progress (0-100)
  error,             // Reactive error state
  processedData,     // Reactive processed data
  processExcel,      // Process Excel file
  uploadFile,        // Upload from file input
  reset,             // Reset upload state
} = useExcelUpload({
  onSuccess: (data) => console.log('Uploaded:', data),
  onError: (error) => console.error('Error:', error),
  onProgress: (progress) => console.log('Progress:', progress.percentage),
  maxRows: 500000,
  maxFileSize: 50 * 1024 * 1024, // 50MB
});
```

**Example:**

```javascript
import { useExcelUpload } from 'vue3-pivottable/composables';

export default {
  setup() {
    const { uploading, uploadProgress, processedData, uploadFile } = useExcelUpload({
      onSuccess: (data) => {
        console.log('Excel loaded:', data.length, 'rows');
      }
    });

    const handleFileChange = async (event) => {
      await uploadFile(event);
    };

    return { uploading, uploadProgress, processedData, handleFileChange };
  },
  template: `
    <div>
      <input type="file" @change="handleFileChange" accept=".xlsx,.xls" />
      <div v-if="uploading">Uploading... {{ uploadProgress }}%</div>
      <div v-if="processedData">Loaded {{ processedData.length }} rows</div>
    </div>
  `
};
```

## Helpers

Vue3 PivotTable provides helper utilities for data transformation, validation, and formatting.

### Data Transformers

Utilities for converting between different data formats.

```javascript
import {
  arrayOfArraysToObjects,
  objectsToArrayOfArrays,
  normalizeData,
  filterDataByField,
  getUniqueValues,
  groupByField,
  sortDataByFields,
  calculateFieldStatistics,
} from 'vue3-pivottable/helpers';
```

**Examples:**

```javascript
// Convert array of arrays to array of objects
const aoa = [
  ['name', 'age'],
  ['John', 30],
  ['Jane', 25]
];
const objects = arrayOfArraysToObjects(aoa);
// Result: [{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }]

// Convert array of objects to array of arrays
const objects = [
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 }
];
const aoa = objectsToArrayOfArrays(objects);
// Result: [['name', 'age'], ['John', 30], ['Jane', 25]]

// Normalize data to consistent format
const normalized = await normalizeData(data);

// Filter data
const filtered = filterDataByField(data, 'city', ['NYC', 'LA']);

// Get unique values
const uniqueCities = getUniqueValues(data, 'city');

// Group data
const grouped = groupByField(data, 'region');

// Sort data
const sorted = sortDataByFields(data, ['name', 'age'], ['asc', 'desc']);

// Calculate statistics
const stats = calculateFieldStatistics(data, 'sales');
// Result: { count: 100, sum: 50000, avg: 500, min: 10, max: 1000, median: 450 }
```

### Validators

Utilities for validating data structures and configurations.

```javascript
import {
  validatePivotData,
  validateFieldName,
  validatePivotConfig,
  validateAggregatorName,
  validateRendererName,
} from 'vue3-pivottable/helpers';
```

**Examples:**

```javascript
// Validate data structure
const result = validatePivotData(data);
if (!result.isValid) {
  console.error(result.error);
}

// Validate field name
const fieldResult = validateFieldName(data, 'sales');
if (!fieldResult.isValid) {
  console.error(fieldResult.error);
}

// Validate configuration
const configResult = validatePivotConfig({
  rows: ['region'],
  cols: ['product'],
  vals: ['sales'],
}, ['region', 'product', 'sales', 'quantity']);
if (!configResult.isValid) {
  console.error(configResult.errors);
}
```

### Formatters

Utilities for formatting numbers, dates, and other data types.

```javascript
import {
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatDuration,
  truncateText,
} from 'vue3-pivottable/helpers';
```

**Examples:**

```javascript
// Format numbers
formatNumber(1234.56); // "1,234.56"
formatNumber(1234.56, { decimals: 0 }); // "1,235"

// Format currency
formatCurrency(1234.56); // "$1,234.56"
formatCurrency(1234.56, { currency: 'EUR', locale: 'de-DE' }); // "1.234,56 €"

// Format percentage
formatPercentage(0.1234); // "12.3%"
formatPercentage(12.34, { asDecimal: false }); // "12.3%"

// Format dates
formatDate(new Date()); // "Jan 15, 2024"
formatDate(new Date(), { dateStyle: 'full' }); // "Monday, January 15, 2024"

// Format file size
formatFileSize(1024 * 1024 * 1.5); // "1.5 MB"

// Format duration
formatDuration(3661000); // "1h 1m 1s"

// Truncate text
truncateText('Very long text here', 10); // "Very long..."
```

## Customization

### Custom Aggregator

```javascript
import { aggregatorTemplates } from 'vue3-pivottable';

const customAggregator = aggregatorTemplates.sum()(['amount']);
```

### Custom Renderer

```javascript
import { makeRenderer } from 'vue3-pivottable';

const customRenderer = makeRenderer({
  name: 'custom-renderer',
  mode: 'table'
});
```

### Complete Example with Composables

```javascript
import { defineComponent } from 'vue';
import { PivottableUi } from 'vue3-pivottable';
import { usePivotData, usePivotConfig, useExcelUpload } from 'vue3-pivottable/composables';
import { validatePivotData, normalizeData } from 'vue3-pivottable/helpers';

export default defineComponent({
  name: 'PivotTableExample',
  components: { PivottableUi },
  setup() {
    // Data management
    const {
      data,
      fields,
      fieldStats,
      loadData,
      analyzeFields,
    } = usePivotData({ autoAnalyze: true });

    // Configuration management
    const {
      rows,
      cols,
      vals,
      aggregatorNames,
      rendererName,
      updateConfig,
    } = usePivotConfig({
      initialAggregatorNames: ['Count', 'Sum'],
      initialRendererName: 'Table',
    });

    // Excel upload
    const {
      uploading,
      uploadProgress,
      uploadFile,
    } = useExcelUpload({
      onSuccess: async (excelData) => {
        // Validate and normalize data
        const validation = validatePivotData(excelData);
        if (!validation.isValid) {
          console.error('Invalid data:', validation.error);
          return;
        }

        const normalized = await normalizeData(excelData);
        await loadData(normalized);
      },
    });

    // Load initial data
    loadData([
      { region: 'North', product: 'A', sales: 100 },
      { region: 'South', product: 'B', sales: 200 },
    ]);

    return {
      data,
      fields,
      fieldStats,
      rows,
      cols,
      vals,
      aggregatorNames,
      rendererName,
      uploading,
      uploadProgress,
      uploadFile,
    };
  },
  template: `
    <div>
      <input
        type="file"
        @change="uploadFile"
        accept=".xlsx,.xls"
        :disabled="uploading"
      />
      <div v-if="uploading">Uploading... {{ uploadProgress }}%</div>
      
      <PivottableUi
        :data="data"
        :rows="rows"
        :cols="cols"
        :vals="vals"
        :aggregatorNames="aggregatorNames"
        :rendererName="rendererName"
      />
    </div>
  `,
});
```

## Building

The project uses Vite for building. Run:

```bash
npm run build
```

This will create:
- `dist/vue3-pivottable.es.js` - ES module build
- `dist/vue3-pivottable.cjs.js` - CommonJS build
- `dist/vue3-pivottable.umd.js` - UMD build
- `dist/vue3-pivottable-frappe.es.js` - Frappe ES module build
- `dist/vue3-pivottable-frappe.umd.js` - Frappe UMD build
- `dist/style.css` - Compiled styles

## Styling

The component includes default styles. Import them:

```javascript
import 'vue3-pivottable/style';
```

You can override these styles to match your application's design.

## API Reference

### Composables API

#### usePivotData(options?)

**Options:**
- `initialData` (Array|Object|Function): Initial data to load
- `autoAnalyze` (Boolean): Automatically analyze fields when data changes (default: true)

**Returns:**
- `data` (Ref): Reactive data reference
- `fields` (Computed): Computed array of field names
- `fieldStats` (Ref): Reactive field statistics
- `isLoading` (Ref): Loading state
- `error` (Ref): Error state
- `rowCount` (Computed): Computed row count
- `isArrayOfArrays` (Computed): True if data is in array of arrays format
- `loadData(data, options?)`: Load data into pivot table
- `analyzeFields()`: Analyze fields and calculate statistics
- `clearData()`: Clear all data and reset state
- `getFieldStats(fieldName)`: Get statistics for a specific field
- `hasField(fieldName)`: Check if field exists
- `getFieldSamples(fieldName, limit?)`: Get sample values for a field

#### usePivotConfig(options?)

**Options:**
- `initialRows` (Array): Initial row attributes
- `initialCols` (Array): Initial column attributes
- `initialVals` (Array): Initial value attributes
- `initialAggregatorNames` (Array|String): Initial aggregator name(s)
- `initialRendererName` (String): Initial renderer name
- `rowTotal` (Boolean): Show row totals (default: true)
- `colTotal` (Boolean): Show column totals (default: true)

**Returns:**
- `rows` (Ref): Reactive array of row attributes
- `cols` (Ref): Reactive array of column attributes
- `vals` (Ref): Reactive array of value attributes
- `aggregatorNames` (Ref): Reactive array of aggregator names
- `rendererName` (Ref): Reactive renderer name
- `showRowTotal` (Ref): Show row totals flag
- `showColTotal` (Ref): Show column totals flag
- `valueFilter` (Ref): Value filter object
- `sorters` (Ref): Sorters object
- `derivedAttributes` (Ref): Derived attributes object
- `configHash` (Computed): Configuration hash for caching
- `hasActiveFields` (Computed): True if any fields are active
- `updateConfig(config)`: Update configuration
- `resetConfig()`: Reset to initial configuration
- `addRow(fieldName)`: Add field to rows
- `removeRow(fieldName)`: Remove field from rows
- `addCol(fieldName)`: Add field to columns
- `removeCol(fieldName)`: Remove field from columns
- `addVal(fieldName)`: Add field to values
- `removeVal(fieldName)`: Remove field from values
- `getConfig()`: Get current configuration object
- `exportConfig()`: Export configuration as JSON string
- `importConfig(jsonString)`: Import configuration from JSON string

#### useExcelUpload(options?)

**Options:**
- `onSuccess` (Function): Callback when upload succeeds
- `onError` (Function): Callback when upload fails
- `onProgress` (Function): Callback for progress updates
- `maxRows` (Number): Maximum rows to process (default: 500000)
- `maxFileSize` (Number): Maximum file size in bytes (default: 50MB)

**Returns:**
- `uploading` (Ref): Uploading state
- `uploadProgress` (Ref): Upload progress (0-100)
- `error` (Ref): Error state
- `processedData` (Ref): Processed data
- `processExcel(file)`: Process Excel file
- `uploadFile(event)`: Upload from file input event
- `reset()`: Reset upload state

### Helpers API

#### Data Transformers

- `arrayOfArraysToObjects(aoa)`: Convert array of arrays to array of objects
- `objectsToArrayOfArrays(objects, headers?)`: Convert array of objects to array of arrays
- `normalizeData(data)`: Normalize data to consistent format
- `filterDataByField(data, fieldName, filterValue)`: Filter data by field values
- `getUniqueValues(data, fieldName)`: Get unique values for a field
- `groupByField(data, fieldName)`: Group data by field
- `sortDataByFields(data, fieldNames, directions?)`: Sort data by field(s)
- `calculateFieldStatistics(data, fieldName)`: Calculate statistics for numeric field

#### Validators

- `validatePivotData(data)`: Validate pivot table data structure
- `validateFieldName(data, fieldName)`: Validate field name exists in data
- `validatePivotConfig(config, availableFields?)`: Validate pivot configuration
- `validateAggregatorName(aggregatorName, availableAggregators?)`: Validate aggregator name
- `validateRendererName(rendererName, availableRenderers?)`: Validate renderer name

#### Formatters

- `formatNumber(value, options?)`: Format number with locale support
- `formatCurrency(value, options?)`: Format currency value
- `formatPercentage(value, options?)`: Format percentage value
- `formatDate(value, options?)`: Format date value
- `formatDateTime(value, options?)`: Format date and time value
- `formatFileSize(bytes, decimals?)`: Format file size in human-readable format
- `formatDuration(milliseconds)`: Format duration in human-readable format
- `truncateText(text, maxLength?, suffix?)`: Truncate text with ellipsis

## Performance Tips

1. **Use Web Workers**: Excel processing automatically uses Web Workers when available for better performance
2. **Virtualization**: Enable virtualization for large tables (>50 rows) to improve rendering performance
3. **Data Format**: Use array of arrays format for better performance with large datasets
4. **Caching**: The pivot engine uses LRU caching for calculated results
5. **Debouncing**: Configuration changes are automatically debounced for better performance

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Requires Web Workers support for Excel processing

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.
