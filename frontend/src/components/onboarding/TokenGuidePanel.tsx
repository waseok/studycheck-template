import { useState } from 'react'
import { TOKEN_GUIDES, TokenGuideId } from './tokenGuideContent'

interface TokenGuidePanelProps {
  guideId: TokenGuideId
}

export function TokenGuidePanel({ guideId }: TokenGuidePanelProps) {
  const [open, setOpen] = useState(false)
  const guide = TOKEN_GUIDES[guideId]

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-amber-950">
            {open ? '발급 방법 접기' : '처음이신가요? 토큰 발급 방법 보기'}
          </p>
          {!open && <p className="mt-0.5 text-xs text-amber-900/80">{guide.summary}</p>}
        </div>
        <span className="shrink-0 text-lg text-amber-700" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-amber-200 px-4 pb-4 pt-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{guide.title}</h3>
            <p className="mt-1 text-xs text-gray-600">{guide.summary}</p>
          </div>

          <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <a
            href={guide.openUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            {guide.openLabel}
            <span aria-hidden>↗</span>
          </a>

          <figure className="space-y-2">
            <figcaption className="text-xs font-medium text-gray-500">화면 예시 (실제 UI와 약간 다를 수 있음)</figcaption>
            {guide.mockScreenshot}
          </figure>

          {guide.tips && guide.tips.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {guide.tips.map((tip) => (
                <li key={tip}>• {tip}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
