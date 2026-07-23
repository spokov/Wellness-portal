export function printElement(elementId) {
  const target = document.getElementById(elementId)
  if (!target) {
    window.print()
    return
  }

  const marked = []
  let node = target.parentElement
  while (node && node !== document.body) {
    node.classList.add('print-branch')
    marked.push(node)
    node = node.parentElement
  }

  target.classList.add('print-target')
  document.body.classList.add('print-mode')

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    document.body.classList.remove('print-mode')
    target.classList.remove('print-target')
    marked.forEach((element) => element.classList.remove('print-branch'))
    window.removeEventListener('afterprint', cleanup)
  }

  window.addEventListener('afterprint', cleanup, { once: true })
  window.requestAnimationFrame(() => window.print())
}
