export function getPostAuthDestination(isStandalone) {
  return isStandalone ? '/home' : '/onboarding?stage=install'
}

export function canFinishOnboarding(isStandalone) {
  return Boolean(isStandalone)
}

export function canAccessMemberApp(profile) {
  return Boolean(profile?.active)
}