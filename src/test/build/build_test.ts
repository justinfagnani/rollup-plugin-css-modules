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

test('Minifies CSS content before file transformation', async () => {
  const bundle = await rollup({
    input: 'index.js',
    plugins: [
      cssModules({
        minify: true,
      }),
      virtual({
        'index.js': `
          import styles from './styles.css' with {type: 'css'};
          console.log(styles);
        `,
        'styles.css': `
          :host {
            display:    block;
            background-color:
              rgba(255,0,  0, 0);;;
          }
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

  assert(
    output[0].code.includes(
      ':host{display:block;background-color:rgba(255,0,0,0)}.foo{color:red}',
    ),
  );
});
