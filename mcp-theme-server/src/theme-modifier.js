const fs = require('fs').promises;
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const t = require('@babel/types');

// Helper to read a JS file and parse it into an AST
async function parseFile(filePath) {
    try {
        const code = await fs.readFile(filePath, 'utf-8');
        return parser.parse(code, {
            sourceType: 'module',
            plugins: ['jsx'] // Enable JSX parsing
        });
    } catch (error) {
        if (error.code === 'ENOENT') return null; // File not found
        throw new Error(`Failed to parse ${filePath}: ${error.message}`);
    }
}

// Helper to generate JS code from an AST and write it to a file
async function writeFileFromAst(filePath, ast) {
    const { code } = generator(ast);
    await fs.writeFile(filePath, code, 'utf-8');
}

// Ensures that 'overrides/app/theme.js' exists and is correctly imported.
// If not, it copies the default theme and updates the import in AppConfig.
async function ensureCustomThemeExists(themeFilePath, appConfigPath, pwaKitProjectPath) {
    let themeFileExists = true;
    try {
        await fs.access(themeFilePath);
    } catch (e) {
        themeFileExists = false;
    }

    if (themeFileExists) {
        // Check if AppConfig correctly imports it. This is a simplification.
        // A more robust check would parse AppConfig and verify the import path.
        const appConfigContent = await fs.readFile(appConfigPath, 'utf-8');
        if (appConfigContent.includes(`from './theme'`) || appConfigContent.includes(`from '../theme'`)|| appConfigContent.includes(`from '../../theme'`)) {
            // Assuming it's correctly set up if a relative import to 'theme' is found
            console.log('Custom theme file exists and seems to be imported.');
            return true; // Already set up
        }
    }

    console.log(`Custom theme file at ${themeFilePath} not found or not correctly imported. Setting it up...`);

    // 1. Determine path to default theme in node_modules
    // This path needs to be relative to the mcp-theme-server's execution directory,
    // or an absolute path to the pwa-kit-theme-explorer's node_modules.
    // Assuming pwaKitProjectPath is the root of the PWA Kit project.
    const defaultThemePath = path.join(pwaKitProjectPath, 'node_modules', '@salesforce', 'retail-react-app', 'app', 'theme.js');
    const defaultThemeSystemPath = path.resolve(defaultThemePath); // Resolve to an absolute path

    try {
        await fs.access(defaultThemeSystemPath);
    } catch (error) {
        console.error(`Default theme file not found at ${defaultThemeSystemPath}. Make sure PWA Kit dependencies are installed.`);
        throw new Error(`Default theme file not found at ${defaultThemeSystemPath}. Cannot scaffold custom theme.`);
    }

    // 2. Copy default theme to overrides/app/theme.js
    await fs.mkdir(path.dirname(themeFilePath), { recursive: true });
    await fs.copyFile(defaultThemeSystemPath, themeFilePath);
    console.log(`Copied default theme to ${themeFilePath}`);

    // 3. Update import in appConfigPath (e.g., overrides/app/components/_app-config/index.jsx)
    const appConfigAst = await parseFile(appConfigPath);
    if (!appConfigAst) {
        throw new Error(`Failed to parse ${appConfigPath}`);
    }

    let importUpdated = false;
    traverse(appConfigAst, {
        ImportDeclaration(astPath) {
            if (astPath.node.source.value.includes('@salesforce/retail-react-app/app/theme')) {
                // Calculate relative path from appConfigPath to themeFilePath
                const relativeThemePath = path.relative(path.dirname(appConfigPath), themeFilePath)
                                            .replace(/\\/g, '/'); // Ensure POSIX paths
                const newSourceValue = `./${relativeThemePath.startsWith('.') ? relativeThemePath : './' + relativeThemePath}`;

                astPath.node.source.value = newSourceValue;
                // Attempt to fix if it ends with .js, though imports usually omit it
                if (astPath.node.source.value.endsWith('.js')) {
                    astPath.node.source.value = astPath.node.source.value.slice(0, -3);
                }
                importUpdated = true;
                console.log(`Updated import in ${appConfigPath} to ${astPath.node.source.value}`);
                astPath.stop(); // Stop traversal once updated
            }
        }
    });

    if (!importUpdated) {
        console.warn(`Could not find the default theme import in ${appConfigPath}. Manual check might be needed.`);
    } else {
        await writeFileFromAst(appConfigPath, appConfigAst);
    }
    return true;
}


// --- Placeholder functions for theme modifications ---

async function updateThemeColors(themeFilePath, appConfigPath, colorSettings) {
    await ensureCustomThemeExists(themeFilePath, appConfigPath, path.dirname(path.dirname(path.dirname(themeFilePath)))); // pwaKitProjectPath
    const ast = await parseFile(themeFilePath);
    if (!ast) throw new Error('Theme file not found after attempting to scaffold.');

    // TODO: Implement AST manipulation for colors
    // console.log('AST manipulation for colors to be implemented.');
    // Example: Find `extendTheme({ ... colors: { ... } ... })`
    // and merge/update colorSettings.

    traverse(ast, {
        ObjectExpression(path) {
            // We are looking for the main object passed to extendTheme/extendBaseTheme
            // This is a heuristic: check if it's an argument to a CallExpression likely named 'extendTheme'
            // or if it's the default export object.
            if (
                (t.isCallExpression(path.parent) &&
                 t.isIdentifier(path.parent.callee) &&
                 (path.parent.callee.name.includes('extendTheme') || path.parent.callee.name.includes('extendBaseTheme'))) ||
                t.isExportDefaultDeclaration(path.parent)
            ) {
                let colorsProperty = path.node.properties.find(
                    (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'colors'
                );

                if (!colorsProperty) {
                    // If 'colors' property doesn't exist, create it
                    colorsProperty = t.objectProperty(t.identifier('colors'), t.objectExpression([]));
                    path.node.properties.push(colorsProperty);
                } else if (!t.isObjectExpression(colorsProperty.value)) {
                    // If 'colors' exists but is not an object, overwrite it (or throw error)
                    console.warn(`'colors' property in theme is not an ObjectExpression. Overwriting.`);
                    colorsProperty.value = t.objectExpression([]);
                }

                const colorsObject = colorsProperty.value; // This is an ObjectExpression

                // Iterate over the colorSettings from the API
                for (const key in colorSettings) {
                    const value = colorSettings[key];
                    let existingColorProp = colorsObject.properties.find(
                        (p) => t.isObjectProperty(p) && (t.isIdentifier(p.key) || t.isStringLiteral(p.key)) && p.key.name === key
                    );

                    if (typeof value === 'string') { // e.g., "brand": "#FF0000"
                        const newValueNode = t.stringLiteral(value);
                        if (existingColorProp) {
                            existingColorProp.value = newValueNode;
                        } else {
                            colorsObject.properties.push(t.objectProperty(t.identifier(key), newValueNode));
                        }
                    } else if (typeof value === 'object') { // e.g., "neutral": { "50": "#...", ... }
                        let nestedColorObject;
                        if (existingColorProp) {
                            if (t.isObjectExpression(existingColorProp.value)) {
                                nestedColorObject = existingColorProp.value;
                            } else { // It exists but is not an object, overwrite
                                nestedColorObject = t.objectExpression([]);
                                existingColorProp.value = nestedColorObject;
                            }
                        } else {
                            nestedColorObject = t.objectExpression([]);
                            existingColorProp = t.objectProperty(t.identifier(key), nestedColorObject);
                            colorsObject.properties.push(existingColorProp);
                        }

                        // Update nested properties (e.g., shades of a color)
                        for (const subKey in value) {
                            const subValue = value[subKey];
                            let existingSubProp = nestedColorObject.properties.find(
                                (p) => t.isObjectProperty(p) && (t.isIdentifier(p.key) || t.isStringLiteral(p.key)) && (p.key.name === subKey || p.key.value === subKey)
                            );
                            const newSubValueNode = t.stringLiteral(subValue);
                            if (existingSubProp) {
                                existingSubProp.value = newSubValueNode;
                            } else {
                                // Chakra keys are often numbers (e.g., 50, 100), ensure they are valid identifiers or use StringLiterals
                                const propKey = /^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(subKey) ? t.identifier(subKey) : t.stringLiteral(subKey);
                                nestedColorObject.properties.push(t.objectProperty(propKey, newSubValueNode));
                            }
                        }
                    }
                }
                path.stop(); // Stop traversal once the main theme object is processed.
            }
        }
    });

    await writeFileFromAst(themeFilePath, ast); // Save changes
    console.log(`Theme colors updated in ${themeFilePath}`);
}

async function updateThemeFonts(themeFilePath, appConfigPath, fontSettings) {
    await ensureCustomThemeExists(themeFilePath, appConfigPath, path.dirname(path.dirname(path.dirname(themeFilePath))));
    const ast = await parseFile(themeFilePath);
    if (!ast) throw new Error('Theme file not found.');

    // TODO: Implement AST manipulation for fonts
    // console.log('AST manipulation for fonts to be implemented.');

    traverse(ast, {
        ObjectExpression(path) {
            if (
                (t.isCallExpression(path.parent) &&
                 t.isIdentifier(path.parent.callee) &&
                 (path.parent.callee.name.includes('extendTheme') || path.parent.callee.name.includes('extendBaseTheme'))) ||
                t.isExportDefaultDeclaration(path.parent)
            ) {
                let fontsProperty = path.node.properties.find(
                    (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'fonts'
                );

                if (!fontsProperty) {
                    fontsProperty = t.objectProperty(t.identifier('fonts'), t.objectExpression([]));
                    path.node.properties.push(fontsProperty);
                } else if (!t.isObjectExpression(fontsProperty.value)) {
                    fontsProperty.value = t.objectExpression([]);
                }

                const fontsObject = fontsProperty.value;

                for (const key in fontSettings) {
                    const value = fontSettings[key];
                    if (key === 'baseSize' && typeof value === 'string') { // Special handling for baseSize potentially
                        // This might go into global styles or a CSS variable,
                        // For now, let's assume it's a direct part of fonts if the theme supports it,
                        // or we can decide to map it to styles.global.body.fontSize later.
                        // Current Chakra UI structure doesn't typically have `baseSize` directly in `fonts`.
                        // This example will add it directly to the fonts object for simplicity.
                        // A more advanced version would map this to the correct Chakra theme structure.
                        console.warn(`'baseSize' handling is simplified. It might need mapping to styles.global or CSS vars.`);
                    }

                    let existingFontProp = fontsObject.properties.find(
                        (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === key
                    );

                    const newValueNode = t.stringLiteral(value);
                    if (existingFontProp) {
                        existingFontProp.value = newValueNode;
                    } else {
                        fontsObject.properties.push(t.objectProperty(t.identifier(key), newValueNode));
                    }
                }
                path.stop();
            }
        }
    });

    await writeFileFromAst(themeFilePath, ast);
    console.log(`Theme fonts updated in ${themeFilePath}`);
}

async function updateGlobalStyles(themeFilePath, appConfigPath, globalStyles) {
    await ensureCustomThemeExists(themeFilePath, appConfigPath, path.dirname(path.dirname(path.dirname(themeFilePath))));
    const ast = await parseFile(themeFilePath);
    if (!ast) throw new Error('Theme file not found.');

    // TODO: Implement AST manipulation for global styles
    // console.log('AST manipulation for global styles to be implemented.');

    // Helper to convert a JS object to an AST ObjectExpression
    function objectToAst(obj) {
        const properties = [];
        for (const key in obj) {
            const value = obj[key];
            let valueNode;
            if (typeof value === 'string') {
                valueNode = t.stringLiteral(value);
            } else if (typeof value === 'number') {
                valueNode = t.numericLiteral(value);
            } else if (typeof value === 'boolean') {
                valueNode = t.booleanLiteral(value);
            } else if (typeof value === 'object' && value !== null) {
                valueNode = objectToAst(value); // Recursively convert nested objects
            } else {
                // Handle null or other types if necessary, for now skip
                continue;
            }
            properties.push(t.objectProperty(t.identifier(key), valueNode));
        }
        return t.objectExpression(properties);
    }

    traverse(ast, {
        ObjectExpression(path) { // Targets the main theme object
            if (
                (t.isCallExpression(path.parent) &&
                 t.isIdentifier(path.parent.callee) &&
                 (path.parent.callee.name.includes('extendTheme') || path.parent.callee.name.includes('extendBaseTheme'))) ||
                t.isExportDefaultDeclaration(path.parent)
            ) {
                let stylesProperty = path.node.properties.find(
                    (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'styles'
                );

                if (!stylesProperty) {
                    stylesProperty = t.objectProperty(t.identifier('styles'), t.objectExpression([]));
                    path.node.properties.push(stylesProperty);
                } else if (!t.isObjectExpression(stylesProperty.value)) {
                    stylesProperty.value = t.objectExpression([]);
                }

                let globalProperty = stylesProperty.value.properties.find(
                    (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'global'
                );

                if (!globalProperty) {
                    globalProperty = t.objectProperty(t.identifier('global'), t.objectExpression([]));
                    stylesProperty.value.properties.push(globalProperty);
                } else if (!t.isObjectExpression(globalProperty.value)) {
                    globalProperty.value = t.objectExpression([]);
                }

                const globalObject = globalProperty.value; // This is an ObjectExpression

                // Merge globalStyles from API into the globalObject AST
                for (const key in globalStyles) { // e.g., key is 'body' or 'a'
                    const styleValue = globalStyles[key]; // e.g., { bg: "#000", color: "white" }

                    let existingStyleKeyProp = globalObject.properties.find(
                        (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === key
                    );

                    const newAstNodeForStyleValue = objectToAst(styleValue);

                    if (existingStyleKeyProp) {
                        // If the key exists (e.g. 'body'), merge its properties
                        if (t.isObjectExpression(existingStyleKeyProp.value)) {
                            // Simple strategy: overwrite existing properties, add new ones
                            const existingSubProps = existingStyleKeyProp.value.properties;
                            const newSubProps = newAstNodeForStyleValue.properties;

                            newSubProps.forEach(newSubProp => {
                                const propName = newSubProp.key.name;
                                const existing = existingSubProps.find(esp => esp.key.name === propName);
                                if (existing) {
                                    existing.value = newSubProp.value; // Overwrite
                                } else {
                                    existingSubProps.push(newSubProp); // Add new
                                }
                            });
                        } else { // Is not an object, so overwrite completely
                           existingStyleKeyProp.value = newAstNodeForStyleValue;
                        }
                    } else {
                        globalObject.properties.push(t.objectProperty(t.identifier(key), newAstNodeForStyleValue));
                    }
                }
                path.stop(); // Processed the main theme object
            }
        }
    });

    await writeFileFromAst(themeFilePath, ast);
    console.log(`Global styles updated in ${themeFilePath}`);
}

async function getThemeConfig(themeFilePath) {
    // This function should also ideally parse the theme.js and extract relevant config.
    // For now, a simple version, or it could be more sophisticated later.
    try {
        await fs.access(themeFilePath); // Check if custom theme exists
    } catch (e) {
        return { message: "Custom theme file not yet created. Default theme is in use." };
    }

    const ast = await parseFile(themeFilePath);
    if (!ast) return null;

    let extractedConfig = {
        colors: {},
        fonts: {},
        styles: { global: {} }
    };

    // Helper to safely convert AST node to JS value, limited scope for now
    function astNodeToValue(node) {
        if (t.isStringLiteral(node)) return node.value;
        if (t.isNumericLiteral(node)) return node.value;
        if (t.isBooleanLiteral(node)) return node.value;
        if (t.isNullLiteral(node)) return null;
        if (t.isObjectExpression(node)) {
            const obj = {};
            node.properties.forEach(prop => {
                if (t.isObjectProperty(prop) && (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key))) {
                    const keyName = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
                    obj[keyName] = astNodeToValue(prop.value);
                }
            });
            return obj;
        }
        // For other types, return a placeholder or undefined
        return `[Non-serializable: ${node ? node.type : 'unknown'}]`;
    }

    traverse(ast, {
        ObjectExpression(path) {
            if (
                (t.isCallExpression(path.parent) &&
                 t.isIdentifier(path.parent.callee) &&
                 (path.parent.callee.name.includes('extendTheme') || path.parent.callee.name.includes('extendBaseTheme'))) ||
                t.isExportDefaultDeclaration(path.parent)
            ) {
                path.node.properties.forEach(prop => {
                    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                        const keyName = prop.key.name;
                        if (keyName === 'colors' && t.isObjectExpression(prop.value)) {
                            extractedConfig.colors = astNodeToValue(prop.value);
                        } else if (keyName === 'fonts' && t.isObjectExpression(prop.value)) {
                            extractedConfig.fonts = astNodeToValue(prop.value);
                        } else if (keyName === 'styles' && t.isObjectExpression(prop.value)) {
                            const stylesValue = prop.value;
                            const globalProp = stylesValue.properties.find(
                                p => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'global'
                            );
                            if (globalProp && t.isObjectExpression(globalProp.value)) {
                                extractedConfig.styles.global = astNodeToValue(globalProp.value);
                            }
                        }
                        // Add other top-level theme properties if needed
                    }
                });
                path.stop(); // Found the main theme object
            }
        }
    });

    console.log('getThemeConfig extracted:', extractedConfig);
    return extractedConfig;
}


module.exports = {
    updateThemeColors,
    updateThemeFonts,
    updateGlobalStyles,
    getThemeConfig,
    ensureCustomThemeExists // Exporting for potential direct use or testing
};
