import type {Plugin, PluginImpl} from 'rollup';
import {basename} from 'path';

export interface CssModulesOptions {
  /**
   * When set, CSS files will be bundled into a single CSS file with
   * `@supports sheet(name)` wrappers, allowing native CSS module support
   * while still bundling.
   *
   * This is useful for browsers that support native CSS modules (Chrome,
   * Firefox) but where you still want to reduce network requests by bundling.
   *
   * When this option is set, the plugin will:
   * 1. Emit a bundled CSS file with all CSS wrapped in `@supports sheet(name)`
   * 2. Transform imports to use a helper that extracts individual sheets
   *
   * **Caveat: Double CSS Parsing**
   *
   * With this option, CSS is parsed twice by the browser's CSS parser: once
   * when loading the bundled CSS file, and again when extracting rules into
   * individual `CSSStyleSheet` objects via `insertRule()`. This differs from
   * the default JS bundling mode where CSS content is embedded as JS strings,
   * which parse very fast (the JS parser just consumes characters until the
   * end of the string, roughly 3-4x faster than average JS expression parsing).
   *
   * This option is primarily a proof of concept for the "Multiple stylesheets
   * per file" proposal: https://github.com/w3c/csswg-drafts/issues/5629
   *
   * Production sites concerned with performance may prefer the default
   * behavior of bundling CSS into JavaScript.
   *
   * @example
   * ```js
   * cssModules({
   *   bundledSheet: {
   *     fileName: 'styles-bundle.css',
   *   }
   * })
   * ```
   */
  bundledSheet?: {
    /**
     * The file name for the bundled CSS output.
     * @default 'styles-bundle.css'
     */
    fileName?: string;
  };
}

/**
 * A helper function that extracts a named stylesheet from a bundled CSS file.
 *
 * The bundled CSS file uses `@supports sheet(name)` wrappers to contain
 * individual stylesheets. This function parses the bundled stylesheet and
 * extracts the rules for the requested sheet name.
 *
 * This is exported as a string so it can be included in the bundle.
 */
export const getBundledSheetSource = `
const sheets = new WeakMap();

export const getBundledSheet = (sheet, name) => {
  let bundledSheets = sheets.get(sheet);
  if (bundledSheets === undefined) {
    sheets.set(sheet, bundledSheets = new Map());
  }
  let bundledSheet = bundledSheets.get(name);
  if (bundledSheet !== undefined) {
    return bundledSheet;
  }
  bundledSheets.set(name, bundledSheet = new CSSStyleSheet());
  for (const rule of sheet.cssRules) {
    if (rule instanceof CSSSupportsRule) {
      // Match sheet("name") or sheet(name) - browsers normalize quotes in conditionText
      const match = /sheet\(["']?(.+?)["']?\)/.exec(rule.conditionText);
      if (match?.[1] === name) {
        for (const bundledRule of rule.cssRules) {
          bundledSheet.insertRule(bundledRule.cssText);
        }
        return bundledSheet;
      }
    }
  }
};`.trim();

/**
 * Transforms CSS files to support standard CSS modules.
 *
 * CSS modules are CSS files that are imported into JavaScript. They have a
 * single default export that is a `CSSStyleSheet` instance of the imported
 * CSS source.
 *
 * This plugin enables CSS module support in Rollup by transforming CSS files
 * that are imported with a `{type: 'css'}` attribute into JavaScript modules
 * that export a `CSSStyleSheet` instance.
 */
export const cssModules: PluginImpl<CssModulesOptions> = (
  options?: CssModulesOptions
): Plugin => {
  const bundledSheetConfig = options?.bundledSheet;
  const bundledFileName = bundledSheetConfig?.fileName ?? 'styles-bundle.css';

  // Track CSS modules for bundling
  const cssModuleSources = new Map<string, string>();

  // Virtual module ID for the helper
  const HELPER_ID = '\0css-modules-helper';
  const BUNDLED_CSS_ID = '\0bundled-css';

  /**
   * Escapes a sheet name for use in CSS @supports sheet("name") and JS strings.
   * Escapes backslashes and double quotes.
   */
  const escapeSheetName = (name: string): string => {
    return name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  };

  return {
    name: 'css-modules',

    buildStart() {
      if (bundledSheetConfig) {
        // Reset state for new build
        cssModuleSources.clear();
      }
    },

    resolveId(source, _importer) {
      if (source === HELPER_ID) {
        return source;
      }
      if (bundledSheetConfig && source === BUNDLED_CSS_ID) {
        return {id: source, external: true};
      }
      return null;
    },

    load(id) {
      if (id === HELPER_ID) {
        return getBundledSheetSource;
      }
      return null;
    },

    transform(code, id) {
      const isCssModule = this.getModuleInfo(id)?.attributes.type === 'css';
      if (!isCssModule) {
        return null;
      }

      if (bundledSheetConfig) {
        // Store the CSS for bundling
        const sheetName = basename(id);
        cssModuleSources.set(sheetName, code);

        // Escape the sheet name for use in JS string literal
        const escapedSheetName = escapeSheetName(sheetName);

        // Return a module that imports from the bundled CSS and extracts this sheet
        return {
          code: `
import bundledStyles from '${BUNDLED_CSS_ID}' with {type: 'css'};
import {getBundledSheet} from '${HELPER_ID}';
const stylesheet = getBundledSheet(bundledStyles, "${escapedSheetName}");
export default stylesheet;
`,
          // Mark the bundled CSS as an external dependency that will be resolved later
          moduleSideEffects: false,
        };
      }

      // Default behavior: inline CSS as JavaScript
      // Escape the CSS source so that it can be used in a template literal.
      const escapedCode = code
        // Preserve any escape sequences in the source:
        .replace('\\', '\\\\')
        // Escape backticks:
        .replace(/`/g, '\\`')
        // Escape ${} interpolation:
        .replace(/\$/g, '\\$');
      return `
const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(\`${escapedCode}\`);
export default stylesheet;
`;
    },

    generateBundle(_outputOptions, bundle) {
      if (!bundledSheetConfig || cssModuleSources.size === 0) {
        return;
      }

      // Generate the bundled CSS content with @supports sheet("name") wrappers
      // Note: The CSS content must have balanced braces. Valid CSS naturally has
      // balanced braces, and the CSS parser correctly handles } inside strings
      // and comments. Malformed CSS with unbalanced braces may cause issues.
      let bundledCss = '';
      for (const [sheetName, cssContent] of cssModuleSources) {
        // Escape the sheet name for CSS: escape backslashes and quotes
        const escapedName = escapeSheetName(sheetName);
        bundledCss += `@supports sheet("${escapedName}") {\n`;
        // Indent the CSS content
        const indentedCss = cssContent
          .split('\n')
          .map((line) => (line.trim() ? `  ${line}` : line))
          .join('\n');
        bundledCss += indentedCss;
        if (!bundledCss.endsWith('\n')) {
          bundledCss += '\n';
        }
        bundledCss += '}\n\n';
      }

      // Emit the bundled CSS file
      this.emitFile({
        type: 'asset',
        fileName: bundledFileName,
        source: bundledCss.trim() + '\n',
      });

      // Update references in the JavaScript bundles to point to the actual CSS file
      for (const [_key, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.code) {
          // Replace the virtual bundled CSS import with the actual file
          chunk.code = chunk.code.replace(
            new RegExp(
              `from\\s*['"]\\u0000bundled-css['"]\\s*with\\s*\\{\\s*type:\\s*['"]css['"]\\s*\\}`,
              'g'
            ),
            `from './${bundledFileName}' with { type: 'css' }`
          );
          // Also handle assert syntax for older browsers
          chunk.code = chunk.code.replace(
            new RegExp(
              `from\\s*['"]\\u0000bundled-css['"]\\s*assert\\s*\\{\\s*type:\\s*['"]css['"]\\s*\\}`,
              'g'
            ),
            `from './${bundledFileName}' assert { type: 'css' }`
          );
        }
      }
    },
  };
};
