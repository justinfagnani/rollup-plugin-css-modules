import test from 'node:test';
import assert from 'node:assert';

import {cssModules} from '../../index.js';
import {rollup, type Plugin} from 'rollup';
import virtualMod, {type RollupVirtualOptions} from '@rollup/plugin-virtual';

const virtual: (modules: RollupVirtualOptions) => Plugin = virtualMod as any;

test('Transforms CSS files imported with the correct attribute', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules(),
      virtual({
        'index.js': `
          import styles from './styles.css' with {type: 'css'};
          console.log(styles);
        `,
        'styles.css': `
          .foo {
            color: red;
          }
        `,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  assert(output[0].code.includes('new CSSStyleSheet()'));
  assert(output[0].code.includes('color: red;'));
  // TODO: more robust test
  assert(!output[0].code.includes(`{ type: 'css' }`));
});

test('Fails on CSS files imported without attributes', async () => {
  assert.rejects(async () => {
    await rollup({
      input: 'index.js',
      plugins: [
        cssModules(),
        virtual({
          'index.js': `
            import styles from './styles.css';
            console.log(styles);
          `,
          'styles.css': `
            .foo {
              color: red;
            }
          `,
        }),
      ],
    });
  });
});

test('Leaves type attribute on external imports', async () => {
  const bundle = await rollup({
    input: 'index.js',
    external(id) {
      return id.endsWith('.css');
    },
    plugins: [
      cssModules(),
      virtual({
        'index.js': `
          import styles from './styles.css' with {type: 'css'};
          console.log(styles);
        `,
        'styles.css': `
          .foo {
            color: red;
          }
        `,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  assert(!output[0].code.includes('new CSSStyleSheet()'));
  assert(!output[0].code.includes('color: red;'));
  assert(output[0].code.includes(`{ type: 'css' }`));
});

// Tests for bundledSheet option

test('bundledSheet: bundles CSS files into a single CSS file with @supports wrappers', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules({
        bundledSheet: {
          fileName: 'bundle.css',
        },
      }),
      virtual({
        'index.js': `
          import stylesA from './a.css' with {type: 'css'};
          import stylesB from './b.css' with {type: 'css'};
          console.log(stylesA, stylesB);
        `,
        'a.css': `.foo { color: red; }`,
        'b.css': `.bar { color: blue; }`,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  // Find the CSS asset
  const cssAsset = output.find(
    (item) => item.type === 'asset' && item.fileName === 'bundle.css',
  );
  assert(cssAsset, 'CSS bundle should be emitted');
  assert(cssAsset.type === 'asset');

  // Check CSS content has @supports wrappers with quoted names
  const cssSource = cssAsset.source as string;
  assert(
    cssSource.includes('@supports sheet("a.css")'),
    'CSS should contain @supports sheet("a.css")',
  );
  assert(
    cssSource.includes('@supports sheet("b.css")'),
    'CSS should contain @supports sheet("b.css")',
  );
  assert(
    cssSource.includes('color: red'),
    'CSS should contain styles from a.css',
  );
  assert(
    cssSource.includes('color: blue'),
    'CSS should contain styles from b.css',
  );

  // Find the JS chunk
  const jsChunk = output.find((item) => item.type === 'chunk');
  assert(jsChunk, 'JS chunk should exist');
  assert(jsChunk.type === 'chunk');

  // Check that JS imports the bundled CSS
  assert(
    jsChunk.code.includes("from './bundle.css'"),
    'JS should import the bundled CSS file',
  );
  assert(
    jsChunk.code.includes("{ type: 'css' }"),
    'JS should have CSS module import attribute',
  );

  // Check that getBundledSheet helper is included
  assert(
    jsChunk.code.includes('getBundledSheet'),
    'JS should include getBundledSheet helper',
  );
  assert(
    jsChunk.code.includes('CSSSupportsRule'),
    'getBundledSheet should check for CSSSupportsRule',
  );
});

test('bundledSheet: uses default fileName when not specified', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules({
        bundledSheet: {},
      }),
      virtual({
        'index.js': `
          import styles from './styles.css' with {type: 'css'};
          console.log(styles);
        `,
        'styles.css': `.foo { color: red; }`,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  const cssAsset = output.find(
    (item) => item.type === 'asset' && item.fileName === 'styles-bundle.css',
  );
  assert(cssAsset, 'CSS bundle should use default name styles-bundle.css');
});

test('bundledSheet: properly indents nested CSS rules', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules({
        bundledSheet: {
          fileName: 'bundle.css',
        },
      }),
      virtual({
        'index.js': `
          import styles from './styles.css' with {type: 'css'};
          console.log(styles);
        `,
        'styles.css': `.foo {
  color: red;
  background: blue;
}

.bar {
  margin: 10px;
}`,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  const cssAsset = output.find(
    (item) => item.type === 'asset' && item.fileName === 'bundle.css',
  );
  assert(cssAsset && cssAsset.type === 'asset');

  const cssSource = cssAsset.source as string;
  // Check that the CSS is wrapped in @supports with quoted name
  assert(cssSource.includes('@supports sheet("styles.css") {'));
  // Check that styles are properly contained within the wrapper
  assert(cssSource.includes('.foo {'));
  assert(cssSource.includes('.bar {'));
});

test('bundledSheet: escapes special characters in filenames', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules({
        bundledSheet: {
          fileName: 'bundle.css',
        },
      }),
      virtual({
        'index.js': `
          import styles from './styles(v2).css' with {type: 'css'};
          console.log(styles);
        `,
        'styles(v2).css': `.foo { color: red; }`,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  const cssAsset = output.find(
    (item) => item.type === 'asset' && item.fileName === 'bundle.css',
  );
  assert(cssAsset && cssAsset.type === 'asset');

  const cssSource = cssAsset.source as string;
  // The filename with parentheses should be quoted to prevent parsing issues
  assert(
    cssSource.includes('@supports sheet("styles(v2).css")'),
    `CSS should contain properly quoted filename, got: ${cssSource}`,
  );

  const jsChunk = output.find((item) => item.type === 'chunk');
  assert(jsChunk && jsChunk.type === 'chunk');
  // JS should also have the properly escaped filename
  assert(
    jsChunk.code.includes('"styles(v2).css"'),
    'JS should contain the filename string',
  );
});

test('bundledSheet: escapes quotes and backslashes in filenames', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules({
        bundledSheet: {
          fileName: 'bundle.css',
        },
      }),
      virtual({
        'index.js': `
          import styles from './styles"test.css' with {type: 'css'};
          console.log(styles);
        `,
        'styles"test.css': `.foo { color: red; }`,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  const cssAsset = output.find(
    (item) => item.type === 'asset' && item.fileName === 'bundle.css',
  );
  assert(cssAsset && cssAsset.type === 'asset');

  const cssSource = cssAsset.source as string;
  // The quote in the filename should be escaped
  assert(
    cssSource.includes('@supports sheet("styles\\"test.css")'),
    `CSS should contain escaped quote in filename, got: ${cssSource}`,
  );
});

test('bundledSheet: handles CSS with closing braces in strings', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules({
        bundledSheet: {
          fileName: 'bundle.css',
        },
      }),
      virtual({
        'index.js': `
          import styles from './styles.css' with {type: 'css'};
          console.log(styles);
        `,
        // CSS with } inside a string - valid CSS that should not break the wrapper
        'styles.css': `.foo { content: "}"; color: red; }
.bar { content: "} more }"; }`,
      }),
    ],
  });
  const {output} = await bundle.generate({
    format: 'es',
    exports: 'named',
  });

  const cssAsset = output.find(
    (item) => item.type === 'asset' && item.fileName === 'bundle.css',
  );
  assert(cssAsset && cssAsset.type === 'asset');

  const cssSource = cssAsset.source as string;
  // Both rules should be present in the bundled CSS
  assert(cssSource.includes('.foo {'), 'Should contain .foo rule');
  assert(cssSource.includes('.bar {'), 'Should contain .bar rule');
  assert(
    cssSource.includes('content: "}"'),
    'Should preserve string with brace',
  );
});
