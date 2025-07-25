// Edit page functionality
document.addEventListener("DOMContentLoaded", () => {
  const urlPath = window.location.pathname
  const entryId = urlPath.split("/")[1] // Get ID from URL like /abc123/edit

  if (!entryId) {
    window.location.href = "/error.html?message=Invalid entry ID"
    return
  }

  // Update UI elements with entry ID
  document.getElementById("entryUrl").textContent = `/${entryId}`
  document.getElementById("viewLink").href = `/${entryId}`
  document.getElementById("cancelLink").href = `/${entryId}`
  document.getElementById("newUrl").placeholder = entryId

  // Load entry data
  loadEntryData(entryId)

  // Handle edit form submission
  const editForm = document.getElementById("editForm")
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    const formData = new FormData(editForm)
    const data = Object.fromEntries(formData.entries())

    const submitBtn = editForm.querySelector('button[type="submit"]')
    const originalText = submitBtn.textContent
    submitBtn.textContent = "Saving..."
    submitBtn.disabled = true

    try {
      const response = await fetch(`/${entryId}/update`, {
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
        showNotification("Failed to update entry", "error")
      }
    } catch (error) {
      console.error("Error:", error)
      showNotification("Network error occurred", "error")
    } finally {
      submitBtn.textContent = originalText
      submitBtn.disabled = false
    }
  })
})

async function loadEntryData(entryId) {
  try {
    const response = await fetch(`/api/entry/${entryId}`)
    if (response.ok) {
      const entry = await response.json()
      document.getElementById("content").value = entry.content

      // Check if there's a new edit code to display from cookie
      const editCodeCookie = getCookie("showEditCode")
      if (editCodeCookie) {
        document.getElementById("editCodeDisplay").style.display = "block"
        document.getElementById("displayedEditCode").textContent = editCodeCookie

        // Delete the cookie after showing it
        deleteCookie("showEditCode")
      }
    } else {
      window.location.href = "/404.html"
    }
  } catch (error) {
    console.error("Error loading entry:", error)
    window.location.href = "/error.html?message=Failed to load entry"
  }
}

function copyEditCode() {
  const editCode = document.getElementById("displayedEditCode").textContent
  copyToClipboard(editCode)
}

function showNotification(message, type) {
  console.log(`Notification: ${message} (Type: ${type})`)
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => {
      console.log("Copied to clipboard successfully!")
    },
    (err) => {
      console.error("Could not copy text: ", err)
    },
  )
}

// Make functions available globally
window.copyEditCode = copyEditCode
window.showNotification = showNotification
window.copyToClipboard = copyToClipboard

function getCookie(name) {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(";").shift()
  return null
}

function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`
}
