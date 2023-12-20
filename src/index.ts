import type {Plugin, PluginImpl} from 'rollup';

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
export const cssModules: PluginImpl = (): Plugin => {
  return {
    name: 'css-modules',
    transform(code, id) {
      const isCssModule = this.getModuleInfo(id)?.attributes.type === 'css';
      if (isCssModule) {
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
      }
      return null;
    },
  };
};
