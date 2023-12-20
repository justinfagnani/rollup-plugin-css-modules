import {cssModules} from './index.js';

export default {
  input: 'test/browser/test-js-module.js',
  output: {
    file: 'test/browser/test-js-module-bundle.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    cssModules(),
  ],
};
