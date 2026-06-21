import { useMemo, useState } from 'react'
import { User } from '../types'

interface ParticipantAddModalProps {
  title: string
  users: User[]
  existingUserIds: string[]
  onClose: () => void
  onAddUsers: (userIds: string[]) => Promise<void>
  onAddExternal: (data: { name: string; affiliation?: string; position?: string }) => Promise<void>
}

const ParticipantAddModal = ({
  title,
  users,
  existingUserIds,
  onClose,
  onAddUsers,
  onAddExternal
}: ParticipantAddModalProps) => {
  const [mode, setMode] = useState<'staff' | 'external'>('staff')
  const [search, setSearch] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [external, setExternal] = useState({ name: '', affiliation: '', position: '' })
  const [submitting, setSubmitting] = useState(false)

  const availableUsers = useMemo(() => users
    .filter(user => !existingUserIds.includes(user.id))
    .filter(user => user.name.includes(search) || user.userType.includes(search) || (user.position || '').includes(search)),
  [users, existingUserIds, search])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (mode === 'staff') {
        await onAddUsers(selectedUserIds)
      } else {
        await onAddExternal({
          name: external.name.trim(),
          affiliation: external.affiliation.trim() || undefined,
          position: external.position.trim() || undefined
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = mode === 'staff' ? selectedUserIds.length > 0 : external.name.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-extrabold text-gray-900 mb-4">{title}</h2>

        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl mb-4">
          <button
            type="button"
            onClick={() => setMode('staff')}
            className={`px-3 py-2 rounded-lg text-sm font-bold ${mode === 'staff' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
          >
            교직원 선택
          </button>
          <button
            type="button"
            onClick={() => setMode('external')}
            className={`px-3 py-2 rounded-lg text-sm font-bold ${mode === 'external' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
          >
            직접 입력
          </button>
        </div>

        {mode === 'staff' ? (
          <>
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:border-blue-500 focus:outline-none"
              placeholder="이름, 유형, 직위로 검색"
            />
            <div className="border-2 border-gray-200 rounded-lg max-h-64 overflow-y-auto mb-3">
              {availableUsers.length === 0 ? (
                <p className="px-3 py-8 text-sm text-center text-gray-500">추가할 수 있는 대상자가 없습니다.</p>
              ) : availableUsers.map(user => (
                <label key={user.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => setSelectedUserIds(previous => previous.includes(user.id) ? previous.filter(id => id !== user.id) : [...previous, user.id])}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-900">{user.name}</span>
                  <span className="text-xs text-gray-500">{user.userType} {user.position ? `· ${user.position}` : ''}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-4">{selectedUserIds.length}명 선택됨</p>
          </>
        ) : (
          <div className="space-y-3 mb-5">
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              교직원 명단에 없는 강사, 학부모 등을 직접 추가합니다.
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">이름 *</label>
              <input
                value={external.name}
                onChange={event => setExternal(previous => ({ ...previous, name: event.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="홍길동"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">소속</label>
              <input
                value={external.affiliation}
                onChange={event => setExternal(previous => ({ ...previous, affiliation: event.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="예: 파주교육지원청, 학부모"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">직위·역할</label>
              <input
                value={external.position}
                onChange={event => setExternal(previous => ({ ...previous, position: event.target.value }))}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="예: 강사, 학부모 대표"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-bold disabled:opacity-50">취소</button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50">
            {submitting ? '추가 중...' : '대상자 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ParticipantAddModal
