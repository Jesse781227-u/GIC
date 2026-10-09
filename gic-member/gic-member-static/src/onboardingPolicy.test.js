import test from 'node:test'
import assert from 'node:assert/strict'
import { canFinishOnboarding, getPostAuthDestination } from './onboardingPolicy.js'

test('post-auth navigation requires opening the installed standalone app', () => {
  assert.equal(getPostAuthDestination(false), '/onboarding?stage=install')
  assert.equal(getPostAuthDestination(true), '/home')
})

test('onboarding cannot finish from a browser tab', () => {
  assert.equal(canFinishOnboarding(false), false)
  assert.equal(canFinishOnboarding(true), true)
})

