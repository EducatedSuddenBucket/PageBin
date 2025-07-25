const express = require("express")
const bodyParser = require("body-parser")
const fs = require("fs-extra")
const path = require("path")
const sanitize = require("sanitize-filename")
const cookieParser = require("cookie-parser")

const app = express()
const PORT = process.env.PORT || 12000

// Middleware
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(cookieParser())
app.use(express.static("public"))

// CORS and iframe support
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  res.header("X-Frame-Options", "ALLOWALL")
  next()
})

// Ensure data directory exists
const dataDir = path.join(__dirname, "data")
fs.ensureDirSync(dataDir)

// Helper functions
function generateId() {
  return Math.random().toString(36).substring(2, 7) // 5 characters
}

function generateEditCode() {
  return Math.random().toString(36).substring(2, 10) // 8 characters
}

function getEntryPath(id) {
  return path.join(dataDir, `${sanitize(id)}.json`)
}

async function loadEntry(id) {
  try {
    const entryPath = getEntryPath(id)
    if (await fs.pathExists(entryPath)) {
      return await fs.readJson(entryPath)
    }
    return null
  } catch (error) {
    console.error("Error loading entry:", error)
    return null
  }
}

async function saveEntry(entry) {
  try {
    const entryPath = getEntryPath(entry.id)
    await fs.writeJson(entryPath, entry, { spaces: 2 })
    return true
  } catch (error) {
    console.error("Error saving entry:", error)
    return false
  }
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.get("/create", (req, res) => {
  res.redirect("/")
})

app.post("/create", async (req, res) => {
  try {
    const { content, customUrl, editCode } = req.body

    if (!content || content.trim() === "") {
      return res.redirect("/error.html?message=" + encodeURIComponent("Content cannot be empty"))
    }

    const id = customUrl && customUrl.trim() !== "" ? sanitize(customUrl.trim()) : generateId()
    const finalEditCode = editCode && editCode.trim() !== "" ? editCode.trim() : generateEditCode()
    const userProvidedEditCode = editCode && editCode.trim() !== ""

    // Check if custom URL already exists
    if (await loadEntry(id)) {
      return res.redirect(
        "/error.html?message=" + encodeURIComponent("URL already exists. Please choose a different one."),
      )
    }

    const entry = {
      id,
      content: content.trim(),
      editCode: finalEditCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (await saveEntry(entry)) {
      // If user didn't provide custom edit code, set cookie to show it on edit page
      if (!userProvidedEditCode) {
        res.cookie("showEditCode", finalEditCode, {
          httpOnly: false,
          maxAge: 5 * 60 * 1000, // 5 minutes
          sameSite: "strict",
        })
      }
      res.redirect(`/${id}/edit`)
    } else {
      res.redirect("/error.html?message=" + encodeURIComponent("Failed to save entry"))
    }
  } catch (error) {
    console.error("Error creating entry:", error)
    res.redirect("/error.html?message=" + encodeURIComponent("Internal server error"))
  }
})

app.get("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const entry = await loadEntry(id)

    if (!entry) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"))
    }

    // Send raw HTML directly
    res.set("Content-Type", "text/html")
    res.send(entry.content)
  } catch (error) {
    console.error("Error loading entry:", error)
    res.status(500).redirect("/error.html?message=" + encodeURIComponent("Internal server error"))
  }
})

app.get("/:id/edit", async (req, res) => {
  try {
    const { id } = req.params
    const entry = await loadEntry(id)

    if (!entry) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"))
    }

    res.sendFile(path.join(__dirname, "public", "edit.html"))
  } catch (error) {
    console.error("Error loading entry for edit:", error)
    res.redirect("/error.html?message=" + encodeURIComponent("Internal server error"))
  }
})

app.post("/:id/update", async (req, res) => {
  try {
    const { id } = req.params
    const { content, editCode, newEditCode, newUrl } = req.body
    const entry = await loadEntry(id)

    if (!entry) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"))
    }

    // Check edit code
    if (!editCode || editCode !== entry.editCode) {
      return res.redirect("/error.html?message=" + encodeURIComponent("Invalid edit code"))
    }

    if (!content || content.trim() === "") {
      return res.redirect("/error.html?message=" + encodeURIComponent("Content cannot be empty"))
    }

    // Handle URL change
    let finalId = id
    if (newUrl && newUrl.trim() !== "" && newUrl.trim() !== id) {
      const sanitizedNewUrl = sanitize(newUrl.trim())

      // Check if new URL already exists
      if (await loadEntry(sanitizedNewUrl)) {
        return res.redirect(
          "/error.html?message=" + encodeURIComponent("New URL already exists. Please choose a different one."),
        )
      }

      // Delete old entry
      const oldEntryPath = getEntryPath(id)
      await fs.remove(oldEntryPath)

      finalId = sanitizedNewUrl
    }

    // Update entry
    entry.id = finalId
    entry.content = content.trim()
    entry.editCode = newEditCode && newEditCode.trim() !== "" ? newEditCode.trim() : entry.editCode
    entry.updatedAt = new Date().toISOString()

    if (await saveEntry(entry)) {
      res.redirect(`/${finalId}/edit`)
    } else {
      res.redirect("/error.html?message=" + encodeURIComponent("Failed to update entry"))
    }
  } catch (error) {
    console.error("Error updating entry:", error)
    res.redirect("/error.html?message=" + encodeURIComponent("Internal server error"))
  }
})

// API endpoint to get entry data
app.get("/api/entry/:id", async (req, res) => {
  try {
    const { id } = req.params
    const entry = await loadEntry(id)

    if (!entry) {
      return res.status(404).json({ error: "Entry not found" })
    }

    // Return entry without edit code for security
    const { editCode, ...publicEntry } = entry
    res.json(publicEntry)
  } catch (error) {
    console.error("Error loading entry:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"))
})

// Error handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error)
  res.status(500).redirect("/error.html?message=" + encodeURIComponent("Internal server error"))
})

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`)
})
