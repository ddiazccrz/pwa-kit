# MCP Theme Server for PWA Kit

## Purpose

The MCP (Multi-Capability PWA-Kit) Theme Server is a Node.js Express application designed to provide an API for programmatically theming a Salesforce PWA Kit retail react application. It allows an AI assistant (or a developer directly) to modify common theme aspects such as colors, fonts, global styles, and the brand logo.

The server works by directly modifying the PWA Kit project's theme configuration files, primarily an overridden Chakra UI theme file.

## Prerequisites

*   Node.js (version recommended by your PWA Kit version, e.g., 18.x, 20.x)
*   An existing PWA Kit project (e.g., one created with `@salesforce/pwa-kit-create-app --preset retail-react-app-demo`)

## Installation

1.  **Clone or download this server project (`mcp-theme-server`).**
2.  **Navigate to the server's directory:**
    ```bash
    cd mcp-theme-server
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    ```

## Running the Server

To run the server, you need to provide the path to your target PWA Kit project.

```bash
npm start -- <path_to_your_pwa_kit_project>
```
Or for development with `nodemon`:
```bash
npm run dev -- <path_to_your_pwa_kit_project>
```

Example:
```bash
npm run dev -- ../my-pwa-kit-app
```

You can also set the `PWA_KIT_PROJECT_PATH` environment variable:
```bash
export PWA_KIT_PROJECT_PATH="../my-pwa-kit-app"
npm start
```

The server will start, typically on `http://localhost:3000`.

## How it Works

The server targets specific files within your PWA Kit project's `overrides/app/` directory:

1.  **Theme File (`overrides/app/theme.js`):**
    *   If this file doesn't exist, the server will attempt to create it by copying the default theme from `@salesforce/retail-react-app/app/theme.js` (located in your PWA Kit project's `node_modules`).
    *   It then modifies this `theme.js` file using AST (Abstract Syntax Tree) manipulation to update colors, fonts, and global styles.

2.  **App Configuration (`overrides/app/components/_app-config/index.jsx`):**
    *   If the `theme.js` file is scaffolded, the server will update the import statement in this file to point to the new local `overrides/app/theme.js` instead of the default theme from `node_modules`.

3.  **Logo (`overrides/app/assets/svg/brand-logo.svg` by default):**
    *   The logo endpoint allows replacing this SVG file (or another specified path).

**Important:** After the server makes changes to these files, you will likely need to restart your PWA Kit development server to see the theme changes reflected in your application.

## API Endpoints

All API endpoints are prefixed with `/api/theme`.

### 1. Set Theme Colors

*   **Endpoint:** `POST /api/theme/colors`
*   **Description:** Sets or updates various color definitions in the theme.
*   **Request Body (JSON):**
    ```json
    {
      "brand": "#FF0000",
      "secondary": "#00FF00",
      "accent": "#0000FF",
      "neutral": {
        "50": "#F7FAFC",
        "100": "#EDF2F7",
        "500": "#A0AEC0",
        "900": "#1A202C"
      },
      "custom": {
        "myCustomColorLight": "#ABCDEF",
        "interactiveElement": "#007BFF"
      }
    }
    ```
*   **Success Response (200 OK):**
    ```json
    {
      "message": "Theme colors updated successfully.",
      "modifiedFiles": ["overrides/app/theme.js", "overrides/app/components/_app-config/index.jsx"]
    }
    ```
    *(Note: `appConfigPath` is included if the theme was just scaffolded)*

### 2. Set Theme Fonts

*   **Endpoint:** `POST /api/theme/fonts`
*   **Description:** Sets or updates font definitions.
*   **Request Body (JSON):**
    ```json
    {
      "heading": "'Merriweather', serif",
      "body": "'Lato', sans-serif",
      "mono": "'Menlo', monospace"
    }
    ```
    *(Note: `baseSize` was considered but is better handled via global styles or specific component styles in Chakra UI).*
*   **Success Response (200 OK):**
    ```json
    {
      "message": "Theme fonts updated successfully.",
      "modifiedFiles": ["overrides/app/theme.js", "overrides/app/components/_app-config/index.jsx"]
    }
    ```

### 3. Set Global Styles

*   **Endpoint:** `POST /api/theme/globalStyles`
*   **Description:** Allows overriding global styles (e.g., for `body`, `a` tags).
*   **Request Body (JSON):**
    ```json
    {
      "body": {
        "bg": "neutral.50",
        "color": "neutral.900",
        "lineHeight": "tall"
      },
      "a": {
        "color": "brand",
        "textDecoration": "underline",
        "_hover": {
          "color": "secondary"
        }
      }
    }
    ```
*   **Success Response (200 OK):**
    ```json
    {
      "message": "Global styles updated successfully.",
      "modifiedFiles": ["overrides/app/theme.js", "overrides/app/components/_app-config/index.jsx"]
    }
    ```

### 4. Update Logo

*   **Endpoint:** `POST /api/theme/logo`
*   **Description:** Replaces the brand logo.
*   **Request Body:** `multipart/form-data`
    *   `logoFile`: The image file (SVG recommended, PNG also possible).
    *   `targetPath` (optional string): Relative path within the PWA Kit project to save the logo, e.g., `overrides/app/assets/img/new-logo.png`. Defaults to `overrides/app/assets/svg/brand-logo.svg`.
*   **Success Response (201 Created):**
    ```json
    {
      "message": "Logo updated successfully.",
      "filePath": "overrides/app/assets/svg/brand-logo.svg"
    }
    ```

### 5. Get Current Theme Configuration

*   **Endpoint:** `GET /api/theme/config`
*   **Description:** Retrieves the current theme configuration from `overrides/app/theme.js`. This helps understand the current state before making changes.
*   **Success Response (200 OK):**
    ```json
    {
      "colors": {
        "brand": "#RRGGBB",
        /* ... other colors ... */
      },
      "fonts": {
        "heading": "...",
        /* ... other fonts ... */
      },
      "styles": {
        "global": {
          "body": { /* ... */ }
        }
      }
    }
    ```
    *If `overrides/app/theme.js` has not been created yet:*
    ```json
    {
        "message": "Custom theme file not yet created. Default theme is in use."
    }
    ```

## Error Responses

*   `400 Bad Request`: Invalid input, missing parameters.
    ```json
    { "message": "Color settings are required." }
    ```
*   `500 Internal Server Error`: Server-side issues (e.g., failed to parse/write theme file).
    ```json
    {
        "error": "Something went wrong!",
        "details": "Detailed error message here..."
    }
    ```

## Future Considerations (Out of Scope for this Version)

*   More granular control over component-specific styles.
*   Managing CSS variables directly.
*   Automatically triggering a PWA Kit dev server rebuild/reload.
*   A more sophisticated CLI using libraries like `yargs` or `commander`.
*   More robust AST-to-object conversion for `GET /api/theme/config` to provide a cleaner JSON representation.
```
