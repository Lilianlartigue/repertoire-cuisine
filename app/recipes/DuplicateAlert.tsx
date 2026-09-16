'use client'

import { useEffect, useState } from 'react'
import styles from './DuplicateAlert.module.css'

type DuplicateCandidate = {
  recipe_a_id: string
  recipe_a_name: string
  recipe_b_id: string
  recipe_b_name: string
  similarity: number
}

export default function DuplicateAlert() {
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/recipes', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setDuplicates(data.duplicate_candidates || []))
      .catch(() => setDuplicates([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading || duplicates.length === 0) return null

  return (
    <div className={`card ${styles.alert}`} role="status">
      <div>
        <strong>⚠️ Attention, des recettes similaires ont été détectées</strong>
        <p className="muted">Je ne fusionne rien automatiquement. Vérifie simplement les fiches ci-dessous si tu penses qu’il s’agit de doublons.</p>
      </div>

      <div className={styles.list}>
        {duplicates.map((item) => (
          <div className={styles.pair} key={`${item.recipe_a_id}-${item.recipe_b_id}`}>
            <span>{item.recipe_a_name}</span>
            <span className={styles.arrow}>↔</span>
            <span>{item.recipe_b_name}</span>
            <span className="badge">{Math.round(item.similarity * 100)} % proche</span>
          </div>
        ))}
      </div>
    </div>
  )
}
