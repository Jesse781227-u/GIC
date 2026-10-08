import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessMemberApp, canFinishOnboarding, getPostAuthDestination } from './onboardingPolicy.js'

test('post-auth navigation requires opening the installed standalone app', () => {
  assert.equal(getPostAuthDestination(false), '/onboarding?stage=install')
  assert.equal(getPostAuthDestination(true), '/home')
})

test('onboarding cannot finish from a browser tab', () => {
  assert.equal(canFinishOnboarding(false), false)
  assert.equal(canFinishOnboarding(true), true)
})

test('active accounts can navigate before completing their profile', () => {
  assert.equal(canAccessMemberApp({ active: true, profileComplete: false }), true)
  assert.equal(canAccessMemberApp({ active: true, profileComplete: true }), true)
  assert.equal(canAccessMemberApp({ active: false, profileComplete: false }), false)
  assert.equal(canAccessMemberApp(null), false)
})