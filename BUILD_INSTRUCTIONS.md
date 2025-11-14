# Build Instructions

## Prerequisites

- Node.js 16+ and npm
- Vue 3 (peer dependency)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Development mode:**
   ```bash
   npm run dev
   ```
   This starts Vite dev server with hot module replacement.

## Building

### Production Build

```bash
npm run build
```

This command:
1. Builds the main library (`vite build`)
2. Builds the Frappe-specific version (`vite build --config vite.frappe.config.js`)

### Build Output

After building, you'll find:

```
dist/
├── vue3-pivottable.es.js          # ES module format
├── vue3-pivottable.cjs.js         # CommonJS format
├── vue3-pivottable.umd.js         # UMD format (browser)
├── vue3-pivottable-frappe.es.js   # Frappe ES module
├── vue3-pivottable-frappe.umd.js  # Frappe UMD
├── style.css                       # Compiled CSS
└── *.map                           # Source maps
```

## Build Configuration

### Main Build (`vite.config.js`)

- **Formats**: ES, CJS, UMD
- **Entry**: `src/entry/index.js`
- **External**: vue, vuedraggable, xlsx
- **Output**: `dist/vue3-pivottable.*.js`

### Frappe Build (`vite.frappe.config.js`)

- **Formats**: ES, UMD
- **Entry**: `src/entry/frappe.js`
- **External**: vue, vuedraggable, xlsx
- **Output**: `dist/vue3-pivottable-frappe.*.js`

## Development Tips

1. **Watch Mode**: Vite automatically watches for changes in dev mode
2. **Source Maps**: Enabled for debugging
3. **CSS**: Extracted to separate file in production
4. **Tree Shaking**: Enabled for optimal bundle size

## Troubleshooting

### Build Fails

- Check Node.js version (16+ required)
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check for syntax errors: `npm run lint`

### Import Errors

- Ensure all imports use `.js` extension
- Check that external dependencies are properly externalized
- Verify Vue 3 is installed as peer dependency

### CSS Not Loading

- Import styles: `import 'vue3-pivottable/style'`
- Check that CSS file is in `dist/` after build

## Publishing

1. Update version in `package.json`
2. Build: `npm run build`
3. Test the build locally
4. Publish: `npm publish`

