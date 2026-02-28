import fs from 'node:fs/promises'
import path from 'node:path'
import Papa from 'papaparse'

const ROOT = process.cwd()
const CSV_PATH = path.join(ROOT, 'public', 'Data.csv')
const IMAGES_DIR = path.join(ROOT, 'public', 'images', 'equipment')
const OUTPUT_JSON = path.join(ROOT, 'public', 'equipment.json')

const stripDiacritics = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'Đ' ? 'D' : 'd'))

const toPascal = (input) => {
  const cleaned = stripDiacritics(String(input ?? '').trim())
  const words = cleaned
    .split(/[^a-zA-Z0-9]+/g)
    .map((w) => w.trim())
    .filter(Boolean)
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
}

const normalizeKey = (s) =>
  stripDiacritics(String(s ?? '').trim()).toLowerCase().replace(/[^a-z0-9]/g, '')

const CLASS_COLUMNS = [
  { key: 'thiet_y', col: 'Thiết y' },
  { key: 'to_van', col: 'Tố Vấn' },
  { key: 'huyet_ha', col: 'Huyết Hà' },
  { key: 'toai_mong', col: 'Toái Mộng' },
  { key: 'cuu_linh', col: 'Cửu Linh' },
  { key: 'than_tuong', col: 'Thần Tương' },
]

const parseMaybeNumber = (raw) => {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const chooseImageBase = (name, imageField, imageBaseSet, imageBaseList) => {
  const explicit = String(imageField ?? '').trim()
    .replace(/\.(png|jpg|jpeg|webp)$/i, '')

  const derived = toPascal(name)

  const candidates = []
  if (explicit) candidates.push(explicit)
  if (derived) candidates.push(derived)

  // Common naming variations in your folder
  if (derived.startsWith('Ao')) candidates.push(derived.slice(2))
  if (derived.startsWith('DayChuyen')) candidates.push(`DC${derived.slice('DayChuyen'.length)}`)
  if (derived.startsWith('Mu')) candidates.push(`Non${derived.slice(2)}`)

  // Some items may exist without the item-type prefix
  for (const c of [...candidates]) {
    if (c.startsWith('Ao')) candidates.push(c.slice(2))
  }

  for (const c of candidates) {
    if (imageBaseSet.has(c)) return c
  }

  // Fuzzy fallback: try best substring match on normalized strings
  const target = normalizeKey(name)
  if (!target) return null

  let best = null
  let bestScore = 0

  for (const base of imageBaseList) {
    const b = normalizeKey(base)
    if (!b) continue
    let score = 0
    if (b.includes(target)) score = target.length / b.length
    else if (target.includes(b)) score = b.length / target.length
    if (score > bestScore) {
      bestScore = score
      best = base
    }
  }

  return bestScore >= 0.55 ? best : null
}

const main = async () => {
  const [csvText, imageFiles] = await Promise.all([
    fs.readFile(CSV_PATH, 'utf8'),
    fs.readdir(IMAGES_DIR).catch(() => []),
  ])

  const imageBases = imageFiles
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .map((f) => f.replace(/\.(png|jpg|jpeg|webp)$/i, ''))

  const imageBaseSet = new Set(imageBases)

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
  })

  if (parsed.errors?.length) {
    console.warn('CSV parse errors:', parsed.errors)
  }

  const rows = parsed.data ?? []
  const items = []
  const missingImages = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row['Tên'] ?? '').trim()
    if (!name) continue

    const imageBase = chooseImageBase(name, row['Ảnh'], imageBaseSet, imageBases)
    if (!imageBase) missingImages.push(name)

    const classRatings = {}
    for (const { key, col } of CLASS_COLUMNS) {
      const val = parseMaybeNumber(row[col])
      if (val != null) classRatings[key] = val
    }

    const ratings = Object.values(classRatings)
    const overallRating =
      ratings.length > 0
        ? ratings.reduce((sum, v) => sum + v, 0) / ratings.length
        : 0

    const stats = String(row['Chỉ số'] ?? '').trim()
    const specialPassive = String(row['Nội tại đặc biệt'] ?? '').trim()
    const notes = String(row['Ghi chú đặc biệt'] ?? '').trim()

    const idBase = toPascal(name) || `Item${i + 1}`

    const item = {
      id: idBase,
      name,
      stats,
      imageUrl: imageBase ? `/images/equipment/${imageBase}.png` : '/placeholder.svg',
      overallRating: Number(overallRating.toFixed(2)),
      classRatings,
    }
    if (specialPassive) item.specialPassive = specialPassive
    if (notes) item.notes = notes

    items.push(item)
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(items, null, 2) + '\n', 'utf8')

  console.log(`Wrote ${items.length} items -> public/equipment.json`)
  if (missingImages.length) {
    console.log(`Missing image match (${missingImages.length}):`)
    for (const n of missingImages) console.log(`- ${n}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

