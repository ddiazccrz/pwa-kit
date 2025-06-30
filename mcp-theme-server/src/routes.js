const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Using promises version of fs
const themeModifier = require('./theme-modifier');

const router = express.Router();

// Configure multer for logo uploads
// Store in a temporary directory first, or handle directly if simple
const upload = multer({
    storage: multer.memoryStorage(), // Keep file in memory for now
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// POST /api/theme/colors
router.post('/colors', async (req, res, next) => {
    try {
        const colorSettings = req.body;
        if (!colorSettings || Object.keys(colorSettings).length === 0) {
            return res.status(400).json({ message: 'Color settings are required.' });
        }
        // Hand off to the themeModifier
        await themeModifier.updateThemeColors(req.themeFilePath, req.appConfigPath, colorSettings);
        res.json({
            message: 'Theme colors updated successfully.',
            modifiedFiles: [req.themeFilePath, req.appConfigPath] // appConfigPath if import needs to change
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/theme/fonts
router.post('/fonts', async (req, res, next) => {
    try {
        const fontSettings = req.body;
        if (!fontSettings || Object.keys(fontSettings).length === 0) {
            return res.status(400).json({ message: 'Font settings are required.' });
        }
        await themeModifier.updateThemeFonts(req.themeFilePath, req.appConfigPath, fontSettings);
        res.json({
            message: 'Theme fonts updated successfully.',
            modifiedFiles: [req.themeFilePath, req.appConfigPath]
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/theme/globalStyles
router.post('/globalStyles', async (req, res, next) => {
    try {
        const globalStyles = req.body;
        if (!globalStyles || Object.keys(globalStyles).length === 0) {
            return res.status(400).json({ message: 'Global styles are required.' });
        }
        await themeModifier.updateGlobalStyles(req.themeFilePath, req.appConfigPath, globalStyles);
        res.json({
            message: 'Global styles updated successfully.',
            modifiedFiles: [req.themeFilePath, req.appConfigPath]
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/theme/logo
router.post('/logo', upload.single('logoFile'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Logo file is required.' });
        }
        const logoFile = req.file;
        const targetPath = req.body.targetPath ? path.join(req.pwaKitProjectPath, req.body.targetPath) : req.defaultLogoPath;

        // Ensure directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        // Write the file
        await fs.writeFile(targetPath, logoFile.buffer);

        res.status(201).json({
            message: 'Logo updated successfully.',
            filePath: targetPath.replace(req.pwaKitProjectPath, '').replace(/^\/+/, '') // Relative path, remove leading slashes
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/theme/config
router.get('/config', async (req, res, next) => {
    try {
        const themeConfig = await themeModifier.getThemeConfig(req.themeFilePath);
        if (!themeConfig) {
            return res.status(404).json({ message: 'Theme file not found or not yet customized.' });
        }
        res.json(themeConfig);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
