// Theme toggle functionality
function setupThemeToggle() {
  const themeToggle = document.getElementById("theme-toggle")
  const themeSwitcher = document.querySelector(".theme-switcher")
  const body = document.body

  if (!themeToggle || !themeSwitcher) {
    console.warn("Theme toggle elements not found")
    return
  }

  // Check system preference
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches

  // Check for saved theme preference or use system preference
  const currentTheme = localStorage.getItem("theme") || (prefersDark ? "dark" : "light")

  if (currentTheme === "dark") {
    body.setAttribute("data-theme", "dark")
    themeSwitcher.classList.add("dark")
    themeToggle.checked = true
  } else {
    body.setAttribute("data-theme", "light")
    themeSwitcher.classList.remove("dark")
    themeToggle.checked = false
  }

  // Listen for system theme changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) {
      const newTheme = e.matches ? "dark" : "light"
      body.setAttribute("data-theme", newTheme)
      themeSwitcher.classList.toggle("dark", e.matches)
      themeToggle.checked = e.matches
    }
  })

  themeToggle.addEventListener("change", function () {
    if (this.checked) {
      body.setAttribute("data-theme", "dark")
      themeSwitcher.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      body.setAttribute("data-theme", "light")
      themeSwitcher.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  })
}

// Utility functions
function showNotification(message, type = "success") {
  const notification = document.createElement("div")
  notification.className = `notification ${type}`
  notification.textContent = message
  document.body.appendChild(notification)

  setTimeout(() => {
    notification.remove()
  }, 3000)
}

function copyToClipboard(text) {
  return navigator.clipboard
    .writeText(text)
    .then(() => {
      showNotification("Copied to clipboard!", "success")
      return true
    })
    .catch(() => {
      showNotification("Failed to copy to clipboard", "error")
      return false
    })
}

// Handle create form submission
document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle()

  const createForm = document.getElementById("createForm")
  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault()

      const formData = new FormData(createForm)
      const data = Object.fromEntries(formData.entries())

      const submitBtn = createForm.querySelector('button[type="submit"]')
      const originalText = submitBtn.textContent
      submitBtn.textContent = "Creating..."
      submitBtn.disabled = true

      try {
        const response = await fetch("/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(data),
        })

        if (response.ok) {
          // Redirect will be handled by the server
          window.location.href = response.url
        } else {
          const errorText = await response.text()
          showNotification("Failed to create entry", "error")
        }
      } catch (error) {
        console.error("Error:", error)
        showNotification("Network error occurred", "error")
      } finally {
        submitBtn.textContent = originalText
        submitBtn.disabled = false
      }
    })
  }

  // Auto-resize textareas
  const textareas = document.querySelectorAll("textarea")
  textareas.forEach((textarea) => {
    autoResize(textarea)
    textarea.addEventListener("input", () => autoResize(textarea))
  })

  function autoResize(textarea) {
    textarea.style.height = "auto"
    textarea.style.height = textarea.scrollHeight + "px"
  }
})

// Export functions for use in other scripts
window.PageBin = {
  showNotification,
  copyToClipboard,
  setupThemeToggle,
}
