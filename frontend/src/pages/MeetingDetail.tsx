import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ParticipantAddModal from '../components/ParticipantAddModal'
import SignaturePad, { SignaturePadRef } from '../components/SignaturePad'
import {
  getMeeting, saveMeetingSignature, deleteMeetingSignature,
  completeMeeting, updateMeeting, addMeetingParticipants, addExternalMeetingParticipant, removeMeetingParticipant,
  MeetingDetail as MeetingDetailType, MeetingParticipant, createMeetingSignatureShareLink
} from '../api/meetings'
import { getUsers } from '../api/users'
import { getSavedSignature, saveSavedSignature } from '../api/signatures'
import { User } from '../types'

const MeetingDetail = () => {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const printRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePadRef>(null)

  const [data, setData] = useState<MeetingDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signingUserId, setSigningUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [savingSignature, setSavingSignature] = useState(false)
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', agenda: '', date: '', location: '' })
  const [showShareLinkModal, setShowShareLinkModal] = useState(false)
  const [shareLinkDays, setShareLinkDays] = useState('3')
  const [shareLinkUrl, setShareLinkUrl] = useState('')
  const [shareLinkExpiresAt, setShareLinkExpiresAt] = useState<number | null>(null)
  const [creatingShareLink, setCreatingShareLink] = useState(false)

  const currentUserId = (() => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return null
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.userId || null
    } catch { return null }
  })()

  const role = localStorage.getItem('role') as string | null
  const isAdmin = role === 'SUPER_ADMIN' || role === 'TRAINING_ADMIN'

  const fetchData = useCallback(async () => {
    if (!meetingId) return
    try {
      const result = await getMeeting(meetingId)
      setData(result)
    } catch (err: any) {
      setError(err?.response?.data?.error || '회의 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  useEffect(() => { fetchData() }, [fetchData])

  // 페이지 로드 시 저장된 서명 불러오기
  useEffect(() => {
    getSavedSignature().then(sig => setSavedSignature(sig)).catch(() => {})
  }, [])

  // 본인 서명 모달 열릴 때 저장된 서명 자동 로드
  useEffect(() => {
    if (signingUserId && signingUserId === currentUserId && savedSignature) {
      // 캔버스 마운트 타이밍에 따라 로드 실패할 수 있어 짧게 재시도
      let attempts = 0
      const timer = setInterval(() => {
        attempts += 1
        signaturePadRef.current?.loadDataURL(savedSignature)
        if (attempts >= 3) clearInterval(timer)
      }, 120)
      return () => clearInterval(timer)
    }
  }, [signingUserId, currentUserId, savedSignature])

  const handleSaveMySignature = async () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      alert('저장할 서명이 없습니다.')
      return
    }
    setSavingSignature(true)
    try {
      const imageData = signaturePadRef.current.toDataURL()
      await saveSavedSignature(imageData)
      setSavedSignature(imageData)
      alert('서명이 저장되었습니다. 다음부터 자동으로 불러옵니다.')
    } catch {
      alert('서명 저장에 실패했습니다.')
    } finally {
      setSavingSignature(false)
    }
  }

  const handleSign = async () => {
    if (!signaturePadRef.current || !meetingId || !signingUserId) return
    if (signaturePadRef.current.isEmpty()) { alert('서명을 입력해주세요.'); return }
    setSaving(true)
    try {
      const imageData = signaturePadRef.current.toDataURL()
      const targetUserId = (isAdmin && signingUserId !== currentUserId) ? signingUserId : undefined
      await saveMeetingSignature(meetingId, imageData, targetUserId)
      setSigningUserId(null)
      await fetchData()
    } catch (err: any) {
      alert(err.response?.data?.error || '서명 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSignature = async (userId: string) => {
    if (!meetingId) return
    try {
      await deleteMeetingSignature(meetingId, userId)
      setDeleteConfirm(null)
      await fetchData()
    } catch { alert('서명 삭제에 실패했습니다.') }
  }

  const handleComplete = async () => {
    if (!meetingId || !data) return
    const next = !data.meeting.isCompleted
    if (!confirm(next ? '이 회의를 완료 처리하시겠습니까? 완료된 회의는 완료 폴더로 이동합니다.' : '완료를 취소하시겠습니까?')) return
    try {
      await completeMeeting(meetingId, next)
      await fetchData()
    } catch { alert('처리 중 오류가 발생했습니다.') }
  }

  const handleRemoveParticipant = async (participant: MeetingParticipant) => {
    if (!meetingId) return
    const signatureNotice = participant.signature ? '\n기존 서명은 별도로 보존되며, 서명 삭제는 서명 삭제 버튼을 이용하세요.' : ''
    if (!confirm(`${participant.name}님을 이 회의등록부의 대상자에서 제외하시겠습니까?${signatureNotice}\n사용자 계정과 다른 기록은 삭제되지 않습니다.`)) return
    try {
      await removeMeetingParticipant(meetingId, participant.userId)
      await fetchData()
    } catch { alert('대상자 제거에 실패했습니다.') }
  }

  const getShareLinkStorageKey = () => `meeting-share-link-${meetingId}`

  const decodeTokenExp = (token: string): number | null => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (!payload.exp) return null
      return payload.exp * 1000
    } catch {
      return null
    }
  }

  const openShareLinkModal = () => {
    const key = getShareLinkStorageKey()
    const raw = localStorage.getItem(key)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { url: string; expiresAt: number }
        if (parsed.expiresAt > Date.now()) {
          setShareLinkUrl(parsed.url)
          setShareLinkExpiresAt(parsed.expiresAt)
        } else {
          localStorage.removeItem(key)
          setShareLinkUrl('')
          setShareLinkExpiresAt(null)
        }
      } catch {
        localStorage.removeItem(key)
      }
    } else {
      setShareLinkUrl('')
      setShareLinkExpiresAt(null)
    }
    setShowShareLinkModal(true)
  }

  const handleCreateShareLink = async () => {
    if (!meetingId) return
    const days = Number(shareLinkDays)
    if (!Number.isFinite(days) || days < 1 || days > 7) {
      alert('만료일은 1일 이상 7일 이하로 입력해주세요.')
      return
    }
    try {
      setCreatingShareLink(true)
      const expiresInHours = Math.floor(days * 24)
      const { token } = await createMeetingSignatureShareLink(meetingId, expiresInHours)
      const url = `${window.location.origin}/sign/meeting/${meetingId}?token=${encodeURIComponent(token)}`
      const expiresAt = decodeTokenExp(token)
      setShareLinkUrl(url)
      setShareLinkExpiresAt(expiresAt)
      localStorage.setItem(getShareLinkStorageKey(), JSON.stringify({ url, expiresAt: expiresAt || Date.now() + expiresInHours * 60 * 60 * 1000 }))
    } catch {
      alert('서명 링크 생성에 실패했습니다.')
    } finally {
      setCreatingShareLink(false)
    }
  }

  const handleCopyCreatedLink = async () => {
    if (!shareLinkUrl) return
    try {
      await navigator.clipboard.writeText(shareLinkUrl)
      alert('서명하기 링크가 복사되었습니다.')
    } catch {
      alert('링크 복사에 실패했습니다.')
    }
  }

  const openAddParticipant = async () => {
    try {
      const users = await getUsers()
      setAllUsers(users)
      setShowAddParticipant(true)
    } catch { alert('교직원 목록을 불러오지 못했습니다.') }
  }

  const handleAddParticipants = async (userIds: string[]) => {
    if (!meetingId || !userIds.length) return
    try {
      await addMeetingParticipants(meetingId, userIds)
      setShowAddParticipant(false)
      await fetchData()
    } catch { alert('참가자 추가에 실패했습니다.') }
  }

  const handleAddExternalParticipant = async (external: { name: string; affiliation?: string; position?: string }) => {
    if (!meetingId) return
    try {
      await addExternalMeetingParticipant(meetingId, external)
      setShowAddParticipant(false)
      await fetchData()
    } catch (err: any) {
      alert(err.response?.data?.error || '외부 대상자 추가에 실패했습니다.')
    }
  }

  const handleSaveEdit = async () => {
    if (!meetingId) return
    try {
      await updateMeeting(meetingId, {
        name: editForm.name,
        agenda: editForm.agenda || undefined,
        date: editForm.date || undefined,
        location: editForm.location || undefined
      })
      setEditing(false)
      await fetchData()
    } catch { alert('수정에 실패했습니다.') }
  }

  const exportPDF = async () => {
    if (!printRef.current) return
    setExporting(true)
    const noPrintEls = printRef.current.querySelectorAll<HTMLElement>('.no-print')
    noPrintEls.forEach(el => { el.style.display = 'none' })
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(printRef.current, {
        scale: 1.5, useCORS: true, backgroundColor: '#ffffff'
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const margin = 8
      const pageW = 210 - margin * 2
      const pageH = 297 - margin * 2
      const imgW = canvas.width
      const imgH = canvas.height
      const ratio = pageW / imgW
      const scaledH = imgH * ratio
      let y = 0
      while (y < scaledH) {
        if (y > 0) pdf.addPage()
        const srcY = (y / scaledH) * imgH
        const sliceH = Math.min(pageH / ratio, imgH - srcY)
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = imgW
        sliceCanvas.height = sliceH
        sliceCanvas.getContext('2d')!.drawImage(canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH)
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, margin, pageW, sliceH * ratio)
        y += pageH
      }
      const fileName = `${data?.meeting.name || '회의'}_등록부_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
    } finally {
      noPrintEls.forEach(el => { el.style.display = '' })
      setExporting(false)
    }
  }

  const participants: MeetingParticipant[] = data?.participants ?? []
  const signedCount = participants.filter(p => p.signature).length
  const myParticipant = participants.find(p => p.userId === currentUserId)

  const formatAffiliation = (p: MeetingParticipant) => {
    if (p.grade && p.class) return `${p.grade}학년 ${p.class}반`
    return p.userType
  }

  return (
    <Layout>
      <div className="px-4 max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/dashboard/meetings')}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
          >
            ← 목록으로
          </button>
          <div className="flex gap-2 no-print">
            {isAdmin && data && (
              <>
                <button
                  onClick={() => {
                    setEditForm({
                      name: data.meeting.name,
                      agenda: data.meeting.agenda || '',
                      date: data.meeting.date || '',
                      location: data.meeting.location || ''
                    })
                    setEditing(true)
                  }}
                  className="px-3 py-1.5 text-sm border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  ✏️ 수정
                </button>
                <button
                  onClick={openAddParticipant}
                  className="px-3 py-1.5 text-sm border-2 border-blue-300 rounded-lg text-blue-700 hover:bg-blue-50"
                >
                  ➕ 대상자 추가
                </button>
                <button
                  onClick={handleComplete}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                    data.meeting.isCompleted
                      ? 'border-2 border-gray-300 text-gray-600 hover:bg-gray-50'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {data.meeting.isCompleted ? '↩️ 완료 취소' : '✅ 완료 처리'}
                </button>
                <button
                  onClick={openShareLinkModal}
                  className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                >
                  🔗 서명하기 링크 만들기
                </button>
              </>
            )}
            <button
              onClick={exportPDF}
              disabled={exporting}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {exporting ? '내보내는 중...' : '📄 PDF 저장'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-500">불러오는 중...</div>
        ) : data ? (
          <>
            {/* 서명 현황 */}
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-4 no-print">
              <span className="text-green-800 font-medium">서명 현황</span>
              <span className="text-green-700">{signedCount} / {participants.length}명 완료</span>
              {myParticipant && !myParticipant.signature && (
                <button
                  onClick={() => setSigningUserId(currentUserId)}
                  className="ml-auto px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  ✍️ 내 서명하기
                </button>
              )}
              {myParticipant?.signature && (
                <span className="ml-auto text-green-700 font-medium text-sm">✅ 서명 완료</span>
              )}
              {data.meeting.isCompleted && (
                <span className="ml-auto px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium">완료된 회의</span>
              )}
            </div>

            {/* 회의등록부 출력 영역 */}
            <div ref={printRef} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-center text-gray-900 mb-4">회의등록부</h1>

              {/* 회의 정보 */}
              <table className="w-full mb-5 text-sm border border-gray-400" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold w-24">회의명</th>
                    <td className="border border-gray-400 px-3 py-2 font-medium" colSpan={3}>{data.meeting.name}</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold">일시</th>
                    <td className="border border-gray-400 px-3 py-2">{data.meeting.date || '-'}</td>
                    <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold w-16">장소</th>
                    <td className="border border-gray-400 px-3 py-2">{data.meeting.location || '-'}</td>
                  </tr>
                  {data.meeting.agenda && (
                    <tr>
                      <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold align-top">회의 안건</th>
                      <td className="border border-gray-400 px-3 py-2 whitespace-pre-wrap" colSpan={3}>{data.meeting.agenda}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* 참가자 서명 테이블 */}
              <table className="w-full text-sm border border-gray-400" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 px-2 py-2 text-center font-semibold w-10">순번</th>
                    <th className="border border-gray-400 px-2 py-2 text-center font-semibold">소속</th>
                    <th className="border border-gray-400 px-2 py-2 text-center font-semibold">직위</th>
                    <th className="border border-gray-400 px-2 py-2 text-center font-semibold">성명</th>
                    <th className="border border-gray-400 px-2 py-2 text-center font-semibold w-28">서명</th>
                    {isAdmin && <th className="border border-gray-400 px-2 py-2 text-center font-semibold no-print w-16">관리</th>}
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p, idx) => (
                    <tr key={p.userId} className="hover:bg-gray-50">
                      <td className="border border-gray-400 px-2 py-2 text-center text-xs">{idx + 1}</td>
                      <td className="border border-gray-400 px-2 py-2 text-center text-xs">{formatAffiliation(p)}</td>
                      <td className="border border-gray-400 px-2 py-2 text-center text-xs">{p.position || '-'}</td>
                      <td className="border border-gray-400 px-2 py-2 text-center text-sm font-medium">{p.name}</td>
                      <td className="border border-gray-400 px-2 py-3 text-center" style={{ minHeight: '48px' }}>
                        {p.signature ? (
                          <img src={p.signature.signatureImage} alt="서명" className="max-h-12 mx-auto object-contain" />
                        ) : (p.userId === currentUserId || isAdmin) ? (
                          <button
                            onClick={() => setSigningUserId(p.userId)}
                            className="text-xs text-green-600 hover:underline no-print"
                          >
                            서명하기
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">미서명</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="border border-gray-400 px-1 py-1 text-center no-print">
                          <div className="flex flex-col gap-1 items-center">
                            {p.signature && (
                              <button
                                onClick={() => setDeleteConfirm(p.userId)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >삭제</button>
                            )}
                            <button
                              onClick={() => handleRemoveParticipant(p)}
                              className="text-xs text-gray-500 hover:text-red-700"
                            >대상 제외</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 합계 */}
              <div className="mt-3 text-right text-sm text-gray-500">
                총 {participants.length}명 중 {signedCount}명 서명 완료
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* 서명 링크 생성 모달 */}
      {showShareLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">서명하기 링크 만들기</h3>
            {shareLinkUrl ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-700">생성된 링크</div>
                <input readOnly value={shareLinkUrl} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <div className="text-xs text-gray-500">
                  만료: {shareLinkExpiresAt ? new Date(shareLinkExpiresAt).toLocaleString('ko-KR') : '-'}
                </div>
                <button onClick={handleCopyCreatedLink} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  링크 복사
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">만료일 (1~7일)</label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={shareLinkDays}
                  onChange={(e) => setShareLinkDays(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleCreateShareLink}
                  disabled={creatingShareLink}
                  className="w-full px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  {creatingShareLink ? '생성 중...' : '만들고 복사하기'}
                </button>
              </div>
            )}
            <button onClick={() => setShowShareLinkModal(false)} className="w-full mt-3 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      {signingUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {isAdmin && signingUserId !== currentUserId
                ? `서명하기 (${data?.participants.find(p => p.userId === signingUserId)?.name || ''})`
                : '전자서명'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">아래 공간에 서명해 주세요.</p>
            {/* 저장된 서명 불러오기 안내 (본인 서명 시에만) */}
            {signingUserId === currentUserId && savedSignature && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">저장된 서명이 자동으로 불러와졌습니다.</span>
                <button
                  type="button"
                  onClick={() => signaturePadRef.current?.loadDataURL(savedSignature)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-300"
                >
                  다시 불러오기
                </button>
              </div>
            )}
            <SignaturePad ref={signaturePadRef} />
            {/* 내 서명 저장 버튼 (본인 서명 시에만) */}
            {signingUserId === currentUserId && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveMySignature}
                  disabled={savingSignature}
                  className="text-xs px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded border border-amber-300 disabled:opacity-50"
                >
                  {savingSignature ? '저장 중...' : '이 서명 저장해두기'}
                </button>
              </div>
            )}
            <div className="flex gap-3 mt-3">
              <button type="button" onClick={() => signaturePadRef.current?.clear()}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
                지우기
              </button>
              <button type="button" onClick={() => setSigningUserId(null)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
                취소
              </button>
              <button type="button" onClick={handleSign} disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">
                {saving ? '저장 중...' : '서명 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 삭제 확인 모달 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">서명 삭제</h3>
            <p className="text-gray-600 text-sm mb-4">이 참가자의 서명을 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
                취소
              </button>
              <button onClick={() => handleDeleteSignature(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 참가자 추가 모달 */}
      {showAddParticipant && (
        <ParticipantAddModal
          title="회의등록부 대상자 추가"
          users={allUsers}
          existingUserIds={participants.map(participant => participant.userId)}
          onClose={() => setShowAddParticipant(false)}
          onAddUsers={handleAddParticipants}
          onAddExternal={handleAddExternalParticipant}
        />
      )}

      {/* 회의 정보 수정 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">회의 정보 수정</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">회의명 *</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">회의 안건</label>
                <textarea rows={3} value={editForm.agenda} onChange={e => setEditForm(f => ({ ...f, agenda: e.target.value }))}
                  className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:outline-none resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">일시</label>
                  <input type="text" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">장소</label>
                  <input type="text" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                    className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditing(false)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
                취소
              </button>
              <button onClick={handleSaveEdit} disabled={!editForm.name.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default MeetingDetail
