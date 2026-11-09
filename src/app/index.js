import { mountExplanation } from "../pages/explanation/index.js"
import { mountMonitor } from "../pages/monitor/index.js"

let unmount = () => {}
let route = null
window.addEventListener("hashchange", renderRoute)
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault()
  document.querySelector("#main").focus()
})
window.addEventListener("pagehide", () => unmount())
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    route = null
    renderRoute()
  }
})
renderRoute()

function renderRoute() {
  const next = location.hash === "#/mechanism" ? "explanation" : "monitor"
  if ((location.hash === "#main" && route !== null) || route === next) return
  const initial = route === null
  unmount()
  route = next
  const main = document.querySelector("#main")
  unmount = next === "explanation" ? mountExplanation(main) : mountMonitor(main)
  document.querySelectorAll("[data-route]").forEach((link) => {
    if (link.dataset.route === next) link.setAttribute("aria-current", "page")
    else link.removeAttribute("aria-current")
  })
  document.title = `${next === "explanation" ? "仕組みを知る" : "モニター"} | Joy-Con Motion Check`
  if (!initial) {
    main.focus()
    window.scrollTo(0, 0)
  }
}
