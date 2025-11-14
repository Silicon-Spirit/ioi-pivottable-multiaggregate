# Project Structure

This document describes the structure of the vue3-pivottable project.

## Directory Structure

```
vue3-pivottable/
├── src/                          # Source code
│   ├── components/              # Vue components
│   │   ├── Pivottable.js        # Core pivot table component (no UI)
│   │   ├── PivottableUi.js      # Full UI component with drag-and-drop
│   │   ├── TableRenderer.js     # All renderers (table, charts, export)
│   │   ├── DraggableAttribute.js # Attribute component for drag-drop
│   │   └── Dropdown.js          # Dropdown select component
│   ├── utils/                   # Utility functions
│   │   ├── defaultProps.js      # Default props definitions
│   │   └── utils.js             # Core utilities (PivotData, aggregators, etc.)
│   ├── styles/                  # Stylesheets
│   │   └── pivottable.css       # Main stylesheet
│   ├── entry/                   # Entry points
│   │   ├── index.js             # Main entry point (general use)
│   │   └── frappe.js           # Frappe Framework entry point
│   └── index.js                 # Re-export for backward compatibility
├── examples/                    # Example files
│   ├── basic-usage.html        # Basic HTML example
│   └── frappe-integration.js   # Frappe integration examples
├── dist/                        # Build output (generated)
├── vite.config.js              # Vite config for main build
├── vite.frappe.config.js       # Vite config for Frappe build
├── package.json                 # Package configuration
├── .eslintrc.js                # ESLint configuration
├── .gitignore                   # Git ignore rules
├── README.md                    # Main documentation
├── CHANGELOG.md                 # Version history
└── LICENSE                      # MIT License
```

## Component Architecture

### Core Components

1. **Pivottable.js**
   - Core pivot table component without UI controls
   - Renders the pivot table based on props
   - Uses TableRenderer to display data

2. **PivottableUi.js**
   - Full-featured UI component
   - Includes drag-and-drop interface
   - Manages state and user interactions
   - Uses Pivottable for rendering

3. **TableRenderer.js**
   - Contains all renderer implementations
   - Table renderer (with heatmap options)
   - Chart renderers (bar, line, pie, percentage)
   - Export renderer (XLSX)

### Utility Components

1. **DraggableAttribute.js**
   - Handles drag-and-drop for attributes
   - Provides filtering UI
   - Manages attribute state

2. **Dropdown.js**
   - Simple dropdown select component
   - Used for renderer and aggregator selection

## Build System

### Vite Configuration

- **vite.config.js**: Main build configuration
  - Builds ES, CJS, and UMD formats
  - Externalizes Vue, vuedraggable, and xlsx
  - Outputs to `dist/` directory

- **vite.frappe.config.js**: Frappe-specific build
  - Builds ES and UMD formats
  - Optimized for Frappe Framework integration
  - Includes plugin registration

### Build Output

After running `npm run build`:

```
dist/
├── vue3-pivottable.es.js          # ES module
├── vue3-pivottable.cjs.js         # CommonJS
├── vue3-pivottable.umd.js          # UMD (browser)
├── vue3-pivottable-frappe.es.js   # Frappe ES module
├── vue3-pivottable-frappe.umd.js  # Frappe UMD
└── style.css                       # Compiled CSS
```

## Entry Points

### Main Entry (`src/entry/index.js`)

For general Vue 3 usage:

```javascript
import { PivottableUi, Pivottable } from 'vue3-pivottable';
```

### Frappe Entry (`src/entry/frappe.js`)

For Frappe Framework integration:

```javascript
import VuePivottable from 'vue3-pivottable/frappe';
// or
import { PivottableUi } from 'vue3-pivottable/frappe';
```

## File Organization Principles

1. **Separation of Concerns**
   - Components in `components/`
   - Utilities in `utils/`
   - Styles in `styles/`
   - Entry points in `entry/`

2. **Clear Imports**
   - All imports use explicit `.js` extensions
   - Relative paths for internal imports
   - Absolute paths via `@/` alias (configured in Vite)

3. **Build Optimization**
   - External dependencies not bundled
   - CSS extracted to separate file
   - Source maps for debugging

4. **Frappe Integration**
   - Dedicated entry point for Frappe
   - Plugin pattern for easy registration
   - Compatible with Frappe's Vue instance

## Development Workflow

1. **Development**
   ```bash
   npm run dev
   ```
   - Starts Vite dev server
   - Hot module replacement enabled

2. **Building**
   ```bash
   npm run build
   ```
   - Builds both main and Frappe versions
   - Outputs to `dist/` directory

3. **Linting**
   ```bash
   npm run lint
   ```
   - Checks code quality
   - Uses ESLint configuration

## Dependencies

### Runtime Dependencies
- `vue` (^3.0.0) - Peer dependency
- `vuedraggable` (^4.1.0) - Drag and drop
- `xlsx` (^0.18.5) - Excel export

### Development Dependencies
- `vite` (^5.0.0) - Build tool
- `@vitejs/plugin-vue` (^5.0.0) - Vue plugin for Vite

## Import Paths

### From Source (Development)
```javascript
import PivottableUi from './src/components/PivottableUi.js';
```

### From Package (Production)
```javascript
// Main entry
import { PivottableUi } from 'vue3-pivottable';

// Frappe entry
import VuePivottable from 'vue3-pivottable/frappe';

// Styles
import 'vue3-pivottable/style';
```

## Notes

- All components use Vue 3 Composition API compatible syntax
- Render functions use `h` from Vue instead of `Vue.h`
- Frappe-specific functions (like `__()`) are used for translations
- Number formatting integrates with Frappe's format system

