# AlphaTab Obsidian Plugin - Engineering Log
**Date:** 2024-06-04

## Project Goal
Integrate AlphaTab.js into an Obsidian plugin to render and display guitar tablature files.

## Context

### Previous Conversation
The primary challenge has been a series of font loading issues with AlphaTab within the Obsidian (Electron-based) plugin environment.

Initial attempts involved using AlphaTab's settings.core.fontDirectory with a local HTTP server (ResourceServer.ts), which led to NetworkErrors, likely due to CORS, CSP, or AlphaTab's internal expectations from the server.

Environment hacking was implemented to make AlphaTab believe it's running in a browser environment (overriding Environment.webPlatform, temporarily undefining globalThis.process and globalThis.module). This allowed the AlphaTab API to be instantiated.

The strategy shifted to loading font files (Bravura WOFF/WOFF2 and bravura_metadata.json) using Node.js fs module, converting them to data:URLs, and supplying them via settings.core.smuflFontSources.

A significant sub-problem was correctly determining the plugin's absolute root directory (actualPluginDir) from main.ts to reliably locate asset files. This was resolved.

Despite data:URLs being provided and document.fonts.check("1em alphaTab") returning true (indicating the browser's font system recognized the font data), a persistent error [AlphaTab][AlphaTab] Font directory could not be detected, cannot create style element prevented the crucial @font-face CSS rule for the SMuFL font from being generated, leading to missing musical symbols (specifically noteheads).

Current Work:
The most recent efforts focused on resolving the Font directory could not be detected error to allow AlphaTab's Environment.createStyleElement method to successfully generate the necessary CSS (@font-face for the font-family: 'alphaTab').

We explored manipulating settings.core.fontDirectory (setting it to a non-null placeholder like "./fonts/") and globalThis.ALPHATAB_FONT (setting it to a dummy file:/// or http:// URL) just before AlphaTab API instantiation.

The latest attempt involved setting globalThis.ALPHATAB_FONT to a placeholder HTTP URL ("http://localhost:12345/fake-font-dir/") and settings.core.fontDirectory to "./placeholder-fonts/".

The user's last provided logs (after applying the latest changes to ITabManager.ts from the Canvas alphatab_manager_font_fix_20240604_v2) show that settings.core.fontDirectory was correctly passed as "./fonts/" to the API, and globalThis.ALPHATAB_FONT was temporarily set. However, the Font directory could not be detected error still occurred, and the <style id="alphaTabStyle"> was not created.

A key positive observation is that document.fonts.check("1em alphaTab") consistently returns true, indicating the font data itself (from data:URL) is likely available to the browser.

## Key Technical Concepts

Obsidian Plugin Development: Understanding the Electron environment, plugin lifecycle (onload, onunload), manifest, and FileSystemAdapter.

AlphaTab.js API: Settings object (core.fontDirectory, core.scriptFile, core.smuflFontSources, display.resources), AlphaTabApi instantiation, rendering lifecycle.

AlphaTab Internals (from documentation/user-provided context):

Environment.ts: createStyleElement, detectFontDirectory, ensureFullUrl, webPlatform.

RenderingResources.ts: Defines fonts for various text elements.

FontLoadingChecker.ts: Font availability detection.

BrowserUiFacade.ts: UI initialization and font checker setup.

@font-face CSS rule generation for font-family: 'alphaTab' (Bravura).

Priority for detectFontDirectory: globalThis.ALPHATAB_FONT, then scriptFile.

Node.js: fs (for reading font files), path (for path manipulation).

Data URLs: For embedding font data directly.

CSS: @font-face rules, font-family.

DOM Manipulation: Creating/injecting style elements.

Debugging: Console logging, DOM inspection (Elements panel), document.fonts API.

TypeScript: Type safety and module organization.

## Relevant Files and Code

main.ts (AlphaTabPlugin):

Responsible for determining actualPluginDir (now correctly implemented).

Instantiates TabView, passing the plugin instance (and thus actualPluginDir).

Handles CSS injection (currently内联方式 for styles.css).

Still contains ResourceServer initialization, though its necessity for font loading is under question.

TabView.ts:

Orchestrates UI (ITabUIManager) and core logic (ITabManager).

Passes actualPluginDir (via this.pluginInstance) to ITabManager.

ITabManager.ts (Canvas: alphatab_manager_font_fix_20240604_v2):

Focus of recent debugging.

Handles AlphaTab API instantiation and settings configuration.

Current strategy for font loading:

Reads Bravura WOFF2/WOFF and bravura_metadata.json using fs from actualPluginDir.

Converts them to data:URLs and sets them to this.settings.core.smuflFontSources.

Sets this.settings.core.scriptFile = null;

Sets this.settings.core.fontDirectory = "./placeholder-fonts/"; (to try and satisfy createStyleElement).

Temporarily sets globalThis.ALPHATAB_FONT = "http://localhost:12345/fake-font-dir/" before API instantiation and cleans it up after.

Important snippet (font loading setup):

```typescript
// In ITabManager.ts, initializeAndLoadScore method
// ... (data:URL creation for smuflFontSources) ...
if (primaryFontLoaded && metadataLoaded) {
    this.settings.core.smuflFontSources = fontDataUrls;
} else { /* error handling */ return; }

this.settings.core.fontDirectory = "./placeholder-fonts/";
this.settings.core.scriptFile = null;

let originalAlphaTabFontGlobal: string | undefined = globalThis.ALPHATAB_FONT;
const placeholderHttpUrl = "http://localhost:12345/fake-font-dir/";
globalThis.ALPHATAB_FONT = placeholderHttpUrl;
// ... try { new AlphaTabApi(...) } finally { /* cleanup globalThis.ALPHATAB_FONT */ } ...
```

ResourceServer.ts:

Provides a local HTTP server. Its role in the current data:URL strategy is diminished for core font loading, but it's still present in main.ts.

Includes detailed path checking and CORS headers.

ITabUIManager.ts, ITabEventHandlers.ts, TracksModal.ts, utils.ts: Supporting modules, largely stable.

## Problem Solving

### Solved

Initial environment detection for AlphaTab (forcing browser mode, undefining process/module).

Reliable determination of the plugin's root directory (actualPluginDir in main.ts).

Successful loading of font data into the browser's font system via data:URLs passed to smuflFontSources (evidenced by document.fonts.check("1em alphaTab") returning true).

CSP issues for main plugin styles.css addressed by inline loading.

### Ongoing Troubleshooting

The primary unresolved issue is the persistent [AlphaTab][alphatab.net] Font directory could not be detected, cannot create style element error.

This error prevents the `<style id="alphaTabStyle">` element (containing the @font-face rule for font-family: 'alphaTab') from being created.

Consequently, musical noteheads are not rendered, even though other parts of the score (符杆, 符旗, 符柄, text) and the font data itself appear to be loaded.

Current hypothesis: AlphaTab's Environment.createStyleElement strictly requires a non-null fontDirectory (derived from Environment.detectFontDirectory()) to proceed, regardless of smuflFontSources. The attempts to satisfy this with settings.core.fontDirectory placeholders or by setting globalThis.ALPHATAB_FONT have not yet succeeded in preventing the error.

## Pending Tasks and Next Steps

The immediate task is to resolve the Font directory could not be detected error to ensure the @font-face CSS rule for the 'alphaTab' font family is correctly generated and injected into the document by Environment.createStyleElement.

Next Step (based on last interaction before this summary request): Analyze why the last attempt (setting globalThis.ALPHATAB_FONT to a dummy HTTP URL and settings.core.fontDirectory to a placeholder) still resulted in the "Font directory could not be detected" error. Specifically, investigate how AlphaTabApi constructor and Environment.detectFontDirectory use/cache these values.

User's last log output was being analyzed to understand the state of settings.core.fontDirectory at the point of API instantiation and why globalThis.ALPHATAB_FONT didn't prevent the error. The log confirmed that settings.core.fontDirectory was correctly set to "./fonts/" in the settings object passed to AlphaTabApi, but the ALPHATAB_FONT global variable strategy (using a placeholder HTTP URL in the last attempt) still didn't prevent the createStyleElement error. This implies detectFontDirectory() is still returning null to createStyleElement.
