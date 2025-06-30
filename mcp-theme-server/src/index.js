const express = require('express');
const path = require('path'); // Will be needed for PWA kit path
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Get PWA Kit project path from command line argument or environment variable
let pwaKitProjectPathArg = process.argv[2] || process.env.PWA_KIT_PROJECT_PATH;

if (!pwaKitProjectPathArg) {
    console.error("Error: PWA Kit project path not provided.");
    console.error("Usage: node src/index.js <path_to_pwa_kit_project>");
    console.error("Or set PWA_KIT_PROJECT_PATH environment variable.");
    // Defaulting for sandbox environment if no arg is provided, assuming sibling directory structure for dev convenience.
    // In a real scenario, exiting might be preferred if the path is strictly required.
    pwaKitProjectPathArg = path.join(__dirname, '../../../pwa-kit-theme-explorer');
    console.warn(`Defaulting to PWA Kit project path: ${pwaKitProjectPathArg}\n`);
}

const PWA_KIT_PROJECT_PATH = path.resolve(pwaKitProjectPathArg); // Resolve to absolute path

// Validate if the path exists (basic check)
try {
    require('fs').statSync(PWA_KIT_PROJECT_PATH).isDirectory();
} catch (error) {
    console.error(`Error: PWA Kit project path "${PWA_KIT_PROJECT_PATH}" does not exist or is not a directory.`);
    process.exit(1);
}


// Make PWA Kit project path available to routes
app.use((req, res, next) => {
    req.pwaKitProjectPath = PWA_KIT_PROJECT_PATH;
    req.themeFilePath = path.join(PWA_KIT_PROJECT_PATH, 'overrides', 'app', 'theme.js');
    req.appConfigPath = path.join(PWA_KIT_PROJECT_PATH, 'overrides', 'app', 'components', '_app-config', 'index.jsx');
    req.defaultLogoPath = path.join(PWA_KIT_PROJECT_PATH, 'overrides', 'app', 'assets', 'svg', 'brand-logo.svg');
    next();
});

// Use the defined routes
app.use('/api/theme', routes);

// Simple error handler
app.use((err, req, res, next) => {
    console.error("Error caught by error handler:", err); // Log the full error
    res.status(500).send({ error: 'Something went wrong!', details: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
});

app.listen(PORT, () => {
    console.log(`MCP Theme Server listening on port ${PORT}`);
    console.log(`Targeting PWA Kit project at: ${PWA_KIT_PROJECT_PATH}`);
    console.log(`Expected custom theme file: ${path.join(PWA_KIT_PROJECT_PATH, 'overrides', 'app', 'theme.js')}`);
    console.log(`Expected AppConfig file: ${path.join(PWA_KIT_PROJECT_PATH, 'overrides', 'app', 'components', '_app-config', 'index.jsx')}`);
});
