const express = require("express")
const bodyParser = require("body-parser")
const fs = require("fs-extra")
const path = require("path")
const sanitize = require("sanitize-filename")
const cookieParser = require("cookie-parser")

const app = express()
const PORT = process.env.PORT || 12000
const STORAGE_BACKEND = process.env.STORAGE_BACKEND || "fs"
const DATABASE_URL = process.env.DATABASE_URL

// Conditional PostgreSQL import
let pg
if (STORAGE_BACKEND === "pg") {
  try {
    pg = require("pg")
  } catch (error) {
    console.error("PostgreSQL support requires 'pg' package. Install with: npm install pg")
    process.exit(1)
  }
}

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

// Storage abstraction layer
class StorageBackend {
  async initialize() {
    throw new Error("initialize() must be implemented")
  }

  async loadEntry(id) {
    throw new Error("loadEntry() must be implemented")
  }

  async saveEntry(entry) {
    throw new Error("saveEntry() must be implemented")
  }

  async deleteEntry(id) {
    throw new Error("deleteEntry() must be implemented")
  }
}

class FileSystemBackend extends StorageBackend {
  constructor() {
    super()
    this.dataDir = path.join(__dirname, "data")
  }

  async initialize() {
    fs.ensureDirSync(this.dataDir)
    console.log("File system backend initialized")
  }

  getEntryPath(id) {
    return path.join(this.dataDir, `${sanitize(id)}.json`)
  }

  async loadEntry(id) {
    try {
      const entryPath = this.getEntryPath(id)
      if (await fs.pathExists(entryPath)) {
        return await fs.readJson(entryPath)
      }
      return null
    } catch (error) {
      console.error("Error loading entry from FS:", error)
      return null
    }
  }

  async saveEntry(entry) {
    try {
      const entryPath = this.getEntryPath(entry.id)
      await fs.writeJson(entryPath, entry, { spaces: 2 })
      return true
    } catch (error) {
      console.error("Error saving entry to FS:", error)
      return false
    }
  }

  async deleteEntry(id) {
    try {
      const entryPath = this.getEntryPath(id)
      await fs.remove(entryPath)
      return true
    } catch (error) {
      console.error("Error deleting entry from FS:", error)
      return false
    }
  }
}

class PostgreSQLBackend extends StorageBackend {
  constructor(connectionString) {
    super()
    this.pool = new pg.Pool({
      connectionString: connectionString
    })
  }

  async initialize() {
    try {
      // Create table if it doesn't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS entries (
          id VARCHAR(255) PRIMARY KEY,
          content TEXT NOT NULL,
          edit_code VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `)
      console.log("PostgreSQL backend initialized")
    } catch (error) {
      console.error("Error initializing PostgreSQL backend:", error)
      throw error
    }
  }

  async loadEntry(id) {
    try {
      const result = await this.pool.query(
        'SELECT id, content, edit_code, created_at, updated_at FROM entries WHERE id = $1',
        [id]
      )
      
      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        id: row.id,
        content: row.content,
        editCode: row.edit_code,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString()
      }
    } catch (error) {
      console.error("Error loading entry from PostgreSQL:", error)
      return null
    }
  }

  async saveEntry(entry) {
    try {
      await this.pool.query(`
        INSERT INTO entries (id, content, edit_code, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          edit_code = EXCLUDED.edit_code,
          updated_at = EXCLUDED.updated_at
      `, [
        entry.id,
        entry.content,
        entry.editCode,
        new Date(entry.createdAt),
        new Date(entry.updatedAt)
      ])
      return true
    } catch (error) {
      console.error("Error saving entry to PostgreSQL:", error)
      return false
    }
  }

  async deleteEntry(id) {
    try {
      await this.pool.query('DELETE FROM entries WHERE id = $1', [id])
      return true
    } catch (error) {
      console.error("Error deleting entry from PostgreSQL:", error)
      return false
    }
  }

  async close() {
    await this.pool.end()
  }
}

// Initialize storage backend
let storage
if (STORAGE_BACKEND === "pg") {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required when STORAGE_BACKEND=pg")
    process.exit(1)
  }
  storage = new PostgreSQLBackend(DATABASE_URL)
} else if (STORAGE_BACKEND === "fs") {
  storage = new FileSystemBackend()
} else {
  console.error(`Invalid STORAGE_BACKEND: ${STORAGE_BACKEND}. Must be "pg" or "fs"`)
  process.exit(1)
}

// Helper functions
function generateId() {
  return Math.random().toString(36).substring(2, 7) // 5 characters
}

function generateEditCode() {
  return Math.random().toString(36).substring(2, 10) // 8 characters
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
    if (await storage.loadEntry(id)) {
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

    if (await storage.saveEntry(entry)) {
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
    const entry = await storage.loadEntry(id)

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
    const entry = await storage.loadEntry(id)

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
    const entry = await storage.loadEntry(id)

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
      if (await storage.loadEntry(sanitizedNewUrl)) {
        return res.redirect(
          "/error.html?message=" + encodeURIComponent("New URL already exists. Please choose a different one."),
        )
      }

      // Delete old entry
      await storage.deleteEntry(id)
      finalId = sanitizedNewUrl
    }

    // Update entry
    entry.id = finalId
    entry.content = content.trim()
    entry.editCode = newEditCode && newEditCode.trim() !== "" ? newEditCode.trim() : entry.editCode
    entry.updatedAt = new Date().toISOString()

    if (await storage.saveEntry(entry)) {
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
    const entry = await storage.loadEntry(id)

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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully')
  if (storage instanceof PostgreSQLBackend) {
    await storage.close()
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully')
  if (storage instanceof PostgreSQLBackend) {
    await storage.close()
  }
  process.exit(0)
})

// Initialize storage and start server
async function startServer() {
  try {
    await storage.initialize()
    console.log(`Using ${STORAGE_BACKEND.toUpperCase()} storage backend`)
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

startServer()
