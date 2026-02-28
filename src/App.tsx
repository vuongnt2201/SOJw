import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'

type ClassId = string

type ClassKey =
  | 'thiet_y'
  | 'huyet_ha'
  | 'cuu_linh'
  | 'to_van'
  | 'than_tuong'
  | 'toai_mong'

const CLASS_META: Record<
  ClassKey,
  { label: string; csvHeaders: string[]; legacyIds: string[] }
> = {
  thiet_y: { label: 'Thiết Y', csvHeaders: ['Thiết y', 'Thiết Y'], legacyIds: ['鐵衣'] },
  huyet_ha: {
    label: 'Huyết Hà',
    csvHeaders: ['Huyết Hà', 'Huyết ha', 'Huyết hà'],
    legacyIds: ['血河'],
  },
  cuu_linh: { label: 'Cửu Linh', csvHeaders: ['Cửu Linh', 'Cuu Linh'], legacyIds: ['九靈'] },
  to_van: { label: 'Tố Vấn', csvHeaders: ['Tố Vấn', 'To Van', 'Tố vấn'], legacyIds: ['素問'] },
  than_tuong: {
    label: 'Thần Tương',
    csvHeaders: ['Thần Tương', 'Than Tuong'],
    legacyIds: ['神相'],
  },
  toai_mong: { label: 'Toái Mộng', csvHeaders: ['Toái Mộng', 'Toai Mong'], legacyIds: ['碎夢'] },
}

const CLASS_ORDER: ClassKey[] = [
  'thiet_y',
  'to_van',
  'huyet_ha',
  'toai_mong',
  'cuu_linh',
  'than_tuong',
]

const classKeyFromAnyId = (id: string): ClassKey | null => {
  const normalized = id.trim()
  for (const key of CLASS_ORDER) {
    const meta = CLASS_META[key]
    if (meta.csvHeaders.some((h) => h.toLowerCase() === normalized.toLowerCase())) return key
    if (meta.legacyIds.includes(normalized)) return key
  }
  return null
}

const getClassLabel = (id: ClassId) => {
  const key = classKeyFromAnyId(id)
  return key ? CLASS_META[key].label : id
}

const parseMaybeNumber = (raw: unknown): number | null => {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const ratingToTier = (rating: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'E' => {
  if (rating >= 5) return 'S'
  if (rating >= 4) return 'A'
  if (rating >= 3) return 'B'
  if (rating >= 2) return 'C'
  if (rating >= 1) return 'D'
  return 'E'
}

const toImageBaseName = (input: string) => {
  const cleaned = input
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'Đ' ? 'D' : 'd'))
  const words = cleaned
    .split(/[^a-zA-Z0-9]+/g)
    .map((w) => w.trim())
    .filter(Boolean)
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
}

export interface EquipmentItem {
  id: string
  name: string
  stats: string
  specialPassive?: string
  notes?: string
  imageUrl: string
  overallRating: number
  classRatings: Record<ClassId, number>
}

type SortKey = 'overall-desc' | 'overall-asc' | 'name-asc' | 'name-desc'

export function App() {
  const [items, setItems] = useState<EquipmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [selectedClass, setSelectedClass] = useState<ClassId | 'all'>('all')
  const [minRating, setMinRating] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('overall-desc')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch('/Data.csv')
        if (!res.ok) {
          throw new Error(`Failed to load Data.csv (${res.status})`)
        }
        const csvText = await res.text()

        const parsed = Papa.parse<Record<string, unknown>>(csvText, {
          header: true,
          skipEmptyLines: 'greedy',
        })

        if (parsed.errors?.length) {
          console.warn('CSV parse errors:', parsed.errors)
        }

        const data = (parsed.data ?? [])
          .map((row, idx): EquipmentItem | null => {
            const name = String(row['Tên'] ?? '').trim()
            if (!name) return null

            const explicitImage = String(row['Ảnh'] ?? '').trim()
            const imageBase = explicitImage || toImageBaseName(name)
            const imageUrl = imageBase
              ? `/images/equipment/${imageBase}.png`
              : '/placeholder.svg'

            const stats = String(row['Chỉ số'] ?? '').trim()
            const specialPassive = String(row['Nội tại độc trân'] ?? '').trim()
            const notes = String(row['Ghi chú đặc biệt'] ?? '').trim()

            const classRatings: Record<ClassId, number> = {}
            for (const key of CLASS_ORDER) {
              const meta = CLASS_META[key]
              const rawVal =
                meta.csvHeaders
                  .map((h) => row[h])
                  .find((v) => v != null && String(v).trim() !== '') ?? null
              const val = parseMaybeNumber(rawVal)
              if (val != null) {
                classRatings[key] = val
              }
            }

            const ratings = Object.values(classRatings)
            const overallRating =
              ratings.length > 0
                ? ratings.reduce((sum, v) => sum + v, 0) / ratings.length
                : 0

            const item: EquipmentItem = {
              id: `${toImageBaseName(name) || 'item'}_${idx}`,
              name,
              stats,
              imageUrl,
              overallRating,
              classRatings,
            }
            if (specialPassive) item.specialPassive = specialPassive
            if (notes) item.notes = notes
            return item
          })
          .filter((x): x is EquipmentItem => x !== null)

        setItems(data)
      } catch (e) {
        console.error(e)
        setError('Không tải được dữ liệu trang bị. Hãy kiểm tra file Data.csv.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const allClasses: ClassId[] = useMemo(() => {
    const present = new Set<ClassKey>()
    for (const item of items) {
      for (const k of Object.keys(item.classRatings)) {
        const key = k as ClassKey
        if (CLASS_ORDER.includes(key)) present.add(key)
      }
    }
    return CLASS_ORDER.filter((k) => present.has(k))
  }, [items])

  const filteredItems = useMemo(() => {
    let result = [...items]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.stats.toLowerCase().includes(q),
      )
    }

    if (selectedClass !== 'all') {
      result = result.filter((it) => it.classRatings[selectedClass] != null)
    }

    if (minRating > 0) {
      result = result.filter((it) => it.overallRating >= minRating)
    }

    result.sort((a, b) => {
      switch (sortKey) {
        case 'overall-desc':
          return b.overallRating - a.overallRating
        case 'overall-asc':
          return a.overallRating - b.overallRating
        case 'name-asc':
          return a.name.localeCompare(b.name)
        case 'name-desc':
          return b.name.localeCompare(a.name)
        default:
          return 0
      }
    })

    return result
  }, [items, search, selectedClass, minRating, sortKey])

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>SOJw Equipment Tierlist</h1>
          <p>
            Tierlist trang bị (tham khảo kiểu{' '}
            <a href="https://epic7x.com/tier-list/" target="_blank" rel="noreferrer">
              Epic7x Tier List
            </a>
            ) cho bang chiến / PvE/PvP, hỗ trợ lọc theo phái và đánh giá.
          </p>
        </div>
      </header>

      <section className="filters">
        <div className="filter-group">
          <label>
            Tìm kiếm
            <input
              type="text"
              placeholder="Tên hoặc chỉ số trang bị..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="filter-group">
          <label>
            Phái
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value as ClassId | 'all')}
            >
              <option value="all">Tất cả</option>
              {allClasses.map((cls) => {
                const label = getClassLabel(cls)
                return (
                  <option key={cls} value={cls}>
                    {label}
                  </option>
                )
              })}
            </select>
          </label>
        </div>

        <div className="filter-group">
          <label>
            Điểm tối thiểu
            <select
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
            >
              <option value={0}>Không lọc</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
              <option value={4.5}>4.5+</option>
            </select>
          </label>
        </div>

        <div className="filter-group">
          <label>
            Sắp xếp
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="overall-desc">Điểm tổng ↓</option>
              <option value="overall-asc">Điểm tổng ↑</option>
              <option value="name-asc">Tên A→Z</option>
              <option value="name-desc">Tên Z→A</option>
            </select>
          </label>
        </div>
      </section>

      <main className="tierlist">
        {loading && <div className="status">Đang tải dữ liệu...</div>}
        {error && !loading && <div className="status status-error">{error}</div>}

        {!loading && !error && (
          <>
            <div className="result-summary">
              {filteredItems.length} / {items.length} trang bị
            </div>

            <div className="card-grid">
              {filteredItems.map((item) => (
                <article key={item.id} className="equip-card">
                  <div className="equip-thumb">
                    <img
                      src={item.imageUrl || '/placeholder.svg'}
                      alt={item.name}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/placeholder.svg'
                      }}
                    />
                    <span
                      className="equip-rating"
                      title={item.overallRating.toFixed(2)}
                    >
                      {ratingToTier(item.overallRating)}
                    </span>
                  </div>
                  <div className="equip-body">
                    <h2 className="equip-name">{item.name}</h2>
                    <div className="equip-classes">
                      {Object.entries(item.classRatings).map(([cls, rating]) => {
                        const label = getClassLabel(cls)
                        return (
                          <span key={cls} className="equip-class-chip">
                            <span className="equip-class-name">{label}</span>
                            <span className="equip-class-rating">
                              {rating.toFixed(1)}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                    <div className="equip-details">
                      {item.stats && (
                        <div className="equip-section">
                          <div className="equip-section-title">Chỉ số</div>
                          <div className="equip-section-text">{item.stats}</div>
                        </div>
                      )}
                      {item.specialPassive && (
                        <div className="equip-section">
                          <div className="equip-section-title">Nội tại</div>
                          <div className="equip-section-text">
                            {item.specialPassive}
                          </div>
                        </div>
                      )}
                      {item.notes && (
                        <div className="equip-notes">{item.notes}</div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

