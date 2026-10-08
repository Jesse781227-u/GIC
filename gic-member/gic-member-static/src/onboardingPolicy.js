export function getPostAuthDestination(isStandalone) {
  return isStandalone ? '/home' : '/onboarding?stage=install'
}

export function canFinishOnboarding(isStandalone) {
  return Boolean(isStandalone)
}