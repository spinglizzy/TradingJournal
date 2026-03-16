import { Router }      from 'express'
import multer           from 'multer'
import { createClient } from '@supabase/supabase-js'
import { randomUUID }   from 'crypto'
import { extname }      from 'path'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const BUCKET    = 'screenshots'
const ALLOWED   = new Set(['image/jpeg','image/jpg','image/png','image/gif','image/webp','image/bmp'])

// Store files in memory so we can stream them to Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },  // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true)
    else cb(new Error('Only image files allowed'))
  },
})

const router = Router()

router.post('/', upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const ext      = extname(req.file.originalname) || '.jpg'
    const userId   = req.userId  // set by requireAuth middleware
    const filename = `${userId}/${randomUUID()}${ext}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert:      false,
      })

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError)
      return res.status(500).json({ error: 'Upload failed' })
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(filename)

    res.json({ path: publicUrl })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message || 'Upload failed' })
  }
})

export default router
