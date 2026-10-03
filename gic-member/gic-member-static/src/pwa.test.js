import test from 'node:test'
import assert from 'node:assert/strict'
import { getBrowserName, getIOSInstallSteps, isIOSDevice } from './pwa.js'

test('recognizes the iOS browser tokens instead of treating every browser as Safari', () => {
  assert.equal(getBrowserName('Mozilla/5.0 (iPhone) CriOS/140.0 Mobile Safari/604.1'), 'Chrome')
  assert.equal(getBrowserName('Mozilla/5.0 (iPhone) FxiOS/142.0 Mobile Safari/604.1'), 'Firefox')
  assert.equal(getBrowserName('Mozilla/5.0 (iPhone) EdgiOS/140.0 Mobile Safari/604.1'), 'Edge')
  assert.equal(getBrowserName('Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1'), 'Safari')
})

test('recognizes iPadOS desktop user agents when touch input is available', () => {
  assert.equal(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5), true)
  assert.equal(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0), false)
})

test('provides a safe generic install guide for an unknown iOS browser', () => {
  assert.deepEqual(getIOSInstallSteps('Unknown'), [
    'Open your browser’s Share or menu button.',
    'Choose “Add to Home Screen”.',
    'Tap “Add”.',
  ])
})