# rollup-plugin-css-modules

Rollup support for standard CSS modules

## Standard CSS modules

[CSS modules](https://web.dev/articles/css-module-scripts) are standard feature of the web platform that allow you to import CSS stylesheets into JavaScript with an `import` statement, just like other JavaScript modules, and now also JSON modules.

CSS modules must be imported with an [import attribute](https://github.com/tc39/proposal-import-attributes) of `type: 'css'` to tell the browser to interpret the imported source as CSS instead of JavaScript.

CSS modules have a single default export that is a `CSSStyleSheet` instance containing the imported CSS. This stylesheet can then be applied to the document or shadow roots via the `adoptedStyleSheets` API, which is available on [documents](https://developer.mozilla.org/en-US/docs/Web/API/Document/adoptedStyleSheets) and [shadow roots](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets).

### Example

`styles.css`:
```css
.foo {
  color: red;
}
```

`index.js`:
```js
import styles from './styles.css' with {type: 'css'};
document.adoptedStyleSheets.push(styles);
```

## Usage

### Install

```
npm i -D rollup-plugin-css-modules
```

### Example Rollup cofig

`rollup.config.js`:

```js
import {cssModules} from 'rollup-plugin-css-modules';

export default {
  input: 'index.js',
  plugins: [cssModules()],
  output: [{
    file: 'bundle.js',
    format: 'es'
  }]
};
```

The `cssModules()` plugin factory takes no options as of now. It may accepts options in the future.

## How it works

`rollup-plugin-css-modules` transforms CSS files that are imported with a `{type: 'css'}` import attribute into JavaScript modules that export a `CSSStyleSheet` object created from the CSS source.

The example files above are transformed to:

`styles.css`:
```js
const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(`.foo {\n  color: red;\n}\n`);
export default stylesheet;
```

`index.js`:
```js
import styles from './styles.css';
document.adoptedStyleSheets.push(styles);
```

This is a transparent and spec compliant transformation. Like native CSS modules, there are no side-effects from loading the CSS, the CSS is parsed only once, and there's a single `CSSStyleSheet` instance shared among all importers.

After the transformation, Rollup can bundle the transformed CSS module into the JavaScript bundle(s) as usual.

### Potential downsides

While the transform is simple and spec compliant, there are two (small) potential downsides to be aware of:

1. The CSS file can't be dynamic. This is a natural consequence of bundling. With native CSS modules you could import a CSS file from a remote URL or from a file path who's contents could change. With bundling the file is fixed at build time.
2. The exact same CSS file can't be shared across JS imports and HTML imports. This is also a consequence of bundling. With native CSS modules you can load the CSS file in many different ways: import into JavaScript, with a `<link rel=stylesheet>` HTML tag, or some other CSS loader. With bundling you will have to leave a copy of the CSS as a plain .css file in order to load other ways.
3. The CSS content is parsed as both JavaScript and CSS. This gives the transform a small performance and memory overhead compared to native CSS modules. On projects that use a similar technique of embedding plain CSS strings into JavaScript and creating `CSSStyleSheet` objects, the overhead was measured to be  small since parsing strings in JavaScript is very fast.
4. Dynamic import isn't supported (yet).

## When to use

1. To use CSS modules in browsers that don't support them
2. To use CSS modules in Chrome versions that support CSS modules but not import attributes
3. To bundle CSS modules to reduce network requests

## Brower support for CSS modules

As of December 2023, no browser supports both CSS modules and import attributes, so a transform is needed to use them.

#### Chrome and Chromium browsers

CSS modules are supported in Chrome [since version 93](https://chromestatus.com/feature/5948572598009856), but V8 only supports the older `assert` import _assertions_ syntax, and not the newer standard-track `with` import _attributes_ specification.

#### Safari

Safari supports constructible stylesheets (`new CSSStyleSheet()`), `adoptedStyleSheets`, and import attributes, but not CSS modules yet.

#### Firefox

Firefox supports constructible stylesheets (`new CSSStyleSheet()`) and `adoptedStyleSheets`, but not import attributes.

## Future work

### Async parsing

It's often better to let the browser parse resources in parallel with other work if possible. We can adjust the transform to use `CSSStyleSheet.prototype.replace()` instead of `replaceSync()` so that the CSS parsing happens off the main thread.

This is possible with top level await, so that the transformed module would look like:

`styles.css`:
```js
const stylesheet = new CSSStyleSheet();
await stylesheet.replace(`.foo {\n  color: red;\n}\n`);
export default stylesheet;
```

First, the performance impact should be measured. The top-level await will block other JavaScript execution in the same module graph, so it may not help that much. On the other hand, other main thread work can resume. This would be an opt-in feature.

### Dynamic import support

Dynamic imports can be generically supported by transforming them into a `fetch()` call:

`load-css.js`:
```ts
const loadCSS = (url) => import(url);
```

Can be tranformed to:
`load-css.js`:
```ts
const loadCSS = (url) => () => {
  // A cache of URL -> Promise<CSSSyleSheet>
  const cache = globalThis._$CSSModuleCache ??= new Map();
  const resolvedURL = new URL(url, import.meta.url).href;
  let stylesheet = cache.get(resolvedURL);
  if (stylesheet !== undefined) {
    return stylesheet;
  }
  stylesheet = new CSSStyleSheet();
  const promise = (async () => {
    const response = await fetch(resolvedURL);
    const text = await response.text();
    return stylesheet.replace(text);
  })();
  cache.set(resolvedURL, promise);
  return promise;
};
```
_This is completely untested code_

### External CSS support

Specifiers marked as external in the Rollup config are correctly left unmodified, but by transforming the CSS module to use `fetch()` and top-level await, we can load external CSS files.

### Bundling CSS into CSS

We can leave CSS external to the JavaScript bundle, in order to take enable the browser to directly parse the CSS, but still bundle all the CSS together while letting each import site receive just the `CSSStyleSheet` object it would have pre-transformation by using [this hack](https://github.com/w3c/csswg-drafts/issues/5629#issuecomment-1401322544) to bundle multiple CSS sheets into one file.

### PostCSS integration

Existing PostCSS Rollup plugins may rely on stylesheets being added to the global document via a `<link>` tag. We could add a PostCSS pass to this plugin so that developers could write CSS that's not supported by browsers natively, or run transforms like Tailwind.

We need to be careful that we don't encourage packages to publish non-standard CSS that requires the use of the transform, however. PostCSS transformation may belong in a separate plugin.

### Minify CSS

CSS minification might be the most common CSS transform, so it could be built in.
