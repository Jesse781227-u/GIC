// GIC motion system: quick 150ms, standard 260ms, and reveal 380ms.
// Keep effects transform/opacity based so they stay inexpensive on mobile GPUs.
export function installMotionObserver() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return () => {}

  const selectors = '.mobile-main > *, .announcement-card, .event-row, .ministry-row, .notification-row, .list-card, .form-card, .profile-menu, .profile-details'
  const reveal = (root = document) => root.querySelectorAll(selectors).forEach((element, index) => {
    if (element.classList.contains('motion-reveal')) return
    element.classList.add('motion-reveal')
    element.style.setProperty('--motion-delay', `${Math.min(index * 42, 210)}ms`)
    observer.observe(element)
  })

  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return
    entry.target.classList.add('motion-visible')
    observer.unobserve(entry.target)
  }), { threshold: 0.08, rootMargin: '0px 0px -24px' })

  reveal()
  const mutationObserver = new MutationObserver(() => reveal())
  mutationObserver.observe(document.body, { childList: true, subtree: true })
  return () => { mutationObserver.disconnect(); observer.disconnect() }
}
