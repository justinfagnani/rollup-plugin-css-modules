import {assert} from 'chai';
import './test-js-module-bundle.js';

test('test', async () => {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="foo">Hello, world!</div>
  `);
  const div = document.querySelector('.foo')!;
  assert.equal(getComputedStyle(div).color, 'rgb(255, 0, 0)');
});
