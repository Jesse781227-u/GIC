const IOS_BROWSER_INSTALL_STEPS = {
  Safari: [
    'Tap the Share button.',
    'Choose “Add to Home Screen”.',
    'Tap “Add”.',
  ],
  Chrome: [
    'Tap the Share button or the ⋯ menu.',
    'Choose “Add to Home Screen”.',
    'Tap “Add”.',
  ],
  Firefox: [
    'Tap the Share button.',
    'Choose “Add to Home Screen”.',
    'Tap “Add”.',
  ],
  Edge: [
    'Tap the ⋯ menu or Share button.',
    'Choose “Add to Home Screen”.',
    'Tap “Add”.',
  ],
}

export function getBrowserName(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (/EdgiOS|EdgA|Edg\//i.test(userAgent)) return 'Edge'
  if (/CriOS|Chrome|Chromium/i.test(userAgent)) return 'Chrome'
  if (/FxiOS|Firefox/i.test(userAgent)) return 'Firefox'
  if (/OPiOS|OPR\//i.test(userAgent)) return 'Opera'
  if (/Version\/[\d.]+.*Safari\//i.test(userAgent)) return 'Safari'
  return 'Unknown'
}

export function isIOSDevice(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
) {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
}

export function getIOSInstallSteps(browserName) {
  return IOS_BROWSER_INSTALL_STEPS[browserName] || [
    'Open your browser’s Share or menu button.',
    'Choose “Add to Home Screen”.',
    'Tap “Add”.',
  ]
}