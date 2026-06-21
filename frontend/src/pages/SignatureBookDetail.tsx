import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ParticipantAddModal from '../components/ParticipantAddModal'
import SignaturePad, { SignaturePadRef } from '../components/SignaturePad'
import {
  getSignatureBook, saveSignature, deleteSignature, syncSignatureStatus, getSavedSignature,
  saveSavedSignature, SignatureBookData, SignatureParticipant, createTrainingSignatureShareLink
} from '../api/signatures'
import { addTrainingParticipant, addExternalTrainingParticipant, removeTrainingParticipant } from '../api/participants'
import { getUsers } from '../api/users'
import { User } from '../types'

const SignatureBookDetail = () => {
  const { trainingId } = useParams<{ trainingId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<SignatureBookData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signingUserId, setSigningUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [customOrder, setCustomOrder] = useState<string[] | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [savingSignature, setSavingSignature] = useState(false)
  const [showShareLinkModal, setShowShareLinkModal] = useState(false)
  const [shareLinkDays, setShareLinkDays] = useState('3')
  const [shareLinkUrl, setShareLinkUrl] = useState('')
  const [shareLinkExpiresAt, setShareLinkExpiresAt] = useState<number | null>(null)
  const [creatingShareLink, setCreatingShareLink] = useState(false)
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])

  const printRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePadRef>(null)

  const currentUserId = (() => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return null
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.userId || null
    } catch {
      return null
    }
  })()

  const role = localStorage.getItem('role') as string | null
  const isAdmin = role === 'SUPER_ADMIN' || role === 'TRAINING_ADMIN'

  const fetchData = useCallback(async () => {
    if (!trainingId) return
    try {
      const result = await getSignatureBook(trainingId)
      setData(result)
    } catch (err: any) {
      const status = err?.response?.status
      const msg = err?.response?.data?.error || err?.message || '알 수 없는 오류'
      setError(`등록부를 불러오지 못했습니다. (${status ? `HTTP ${status}: ` : ''}${msg})`)
    } finally {
      setLoading(false)
    }
  }, [trainingId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
    if (!signaturePadRef.current || !trainingId || !signingUserId) return
    if (signaturePadRef.current.isEmpty()) {
      alert('서명을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const imageData = signaturePadRef.current.toDataURL()
      // 관리자가 타인을 대신 서명하는 경우 targetUserId 전달
      const targetUserId = (isAdmin && signingUserId !== currentUserId) ? signingUserId : undefined
      await saveSignature(trainingId, imageData, targetUserId)
      setSigningUserId(null)
      await fetchData()
    } catch (err: any) {
      alert(err.response?.data?.error || '서명 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleSyncStatus = async () => {
    if (!trainingId) return
    try {
      const result = await syncSignatureStatus(trainingId)
      alert(`${result.updated}명의 이수 상태가 완료로 업데이트되었습니다.`)
      await fetchData()
    } catch {
      alert('동기화에 실패했습니다.')
    }
  }

  const handleDelete = async (userId: string) => {
    if (!trainingId) return
    try {
      await deleteSignature(trainingId, userId)
      setDeleteConfirm(null)
      await fetchData()
    } catch {
      alert('서명 삭제에 실패했습니다.')
    }
  }

  const openAddParticipant = async () => {
    try {
      setAllUsers(await getUsers())
      setShowAddParticipant(true)
    } catch {
      alert('교직원 목록을 불러오지 못했습니다.')
    }
  }

  const handleAddParticipants = async (userIds: string[]) => {
    if (!trainingId || userIds.length === 0) return
    try {
      await Promise.all(userIds.map(userId => addTrainingParticipant(trainingId, userId)))
      setShowAddParticipant(false)
      setCustomOrder(null)
      await fetchData()
    } catch (err: any) {
      alert(err.response?.data?.error || '대상자 추가에 실패했습니다.')
    }
  }

  const handleAddExternalParticipant = async (external: { name: string; affiliation?: string; position?: string }) => {
    if (!trainingId) return
    try {
      await addExternalTrainingParticipant(trainingId, external)
      setShowAddParticipant(false)
      setCustomOrder(null)
      await fetchData()
    } catch (err: any) {
      alert(err.response?.data?.error || '외부 대상자 추가에 실패했습니다.')
    }
  }

  const handleRemoveParticipant = async (participant: SignatureParticipant) => {
    if (!trainingId) return
    const signatureNotice = participant.signature ? '\n기존 서명은 별도로 보존되며, 서명 삭제는 서명 삭제 버튼을 이용하세요.' : ''
    if (!confirm(`${participant.name}님을 이 연수등록부의 대상자에서 제외하시겠습니까?${signatureNotice}\n사용자 계정과 다른 기록은 삭제되지 않습니다.`)) return
    try {
      await removeTrainingParticipant(trainingId, participant.userId)
      setCustomOrder(null)
      await fetchData()
    } catch (err: any) {
      alert(err.response?.data?.error || '대상자 제거에 실패했습니다.')
    }
  }

  const getShareLinkStorageKey = () => `training-share-link-${trainingId}`

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
    if (!trainingId) return
    const days = Number(shareLinkDays)
    if (!Number.isFinite(days) || days < 1 || days > 7) {
      alert('만료일은 1일 이상 7일 이하로 입력해주세요.')
      return
    }
    try {
      setCreatingShareLink(true)
      const expiresInHours = Math.floor(days * 24)
      const { token } = await createTrainingSignatureShareLink(trainingId, expiresInHours)
      const url = `${window.location.origin}/sign/training/${trainingId}?token=${encodeURIComponent(token)}`
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

  const formatAffiliation = (p: SignatureParticipant) => {
    if (p.grade && p.class) return `${p.grade}학년 ${p.class}반`
    if (p.grade) return `${p.grade}학년`
    return p.userType
  }

  // 교장 > 교감 > 담임 > 교과전담 > 유치원 > 행정실 > 그 외 순 정렬
  const sortedParticipants = [...(data?.participants ?? [])].sort((a, b) => {
    const getOrder = (p: SignatureParticipant): number => {
      const isTeacher = p.userType === '교원' || p.userType === '기간제교사'
      if (isTeacher) {
        if (p.position === '교장') return 0
        if (p.position === '교감') return 1
        if (p.grade && p.class) return 2  // 학급 담임
        return 3  // 교과 전담
      }
      if (p.userType === '유치원') return 4
      if (['직원', '공무직', '교육공무직', '교직원'].includes(p.userType)) return 5
      return 6
    }
    const oa = getOrder(a), ob = getOrder(b)
    if (oa !== ob) return oa - ob
    const ga = parseInt(a.grade || '99') || 99
    const gb = parseInt(b.grade || '99') || 99
    if (ga !== gb) return ga - gb
    const ca = parseInt(a.class || '99') || 99
    const cb = parseInt(b.class || '99') || 99
    if (ca !== cb) return ca - cb
    return a.name.localeCompare(b.name, 'ko')
  })

  const displayParticipants = customOrder
    ? customOrder.map(id => sortedParticipants.find(p => p.userId === id)).filter((p): p is SignatureParticipant => p !== undefined)
    : sortedParticipants

  const moveParticipant = (idx: number, dir: 'up' | 'down') => {
    const ids = (customOrder ?? sortedParticipants.map(p => p.userId))
    const arr = [...ids]
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= arr.length) return
    ;[arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]
    setCustomOrder(arr)
  }

  const exportPNG = async () => {
    if (!printRef.current || !data) return
    setExporting(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `${data.training.name}_등록부.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      alert('PNG 내보내기에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }

  const exportPDF = async () => {
    if (!printRef.current || !data) return
    setExporting(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      // 관리 버튼(no-print) 요소 임시 숨김
      const noPrintEls = printRef.current.querySelectorAll<HTMLElement>('.no-print')
      noPrintEls.forEach(el => { el.style.display = 'none' })

      const canvas = await html2canvas(printRef.current, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      // 관리 버튼 복원
      noPrintEls.forEach(el => { el.style.display = '' })

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const margin = 8
      const pdfPageW = pdf.internal.pageSize.getWidth() - margin * 2
      const pdfPageH = pdf.internal.pageSize.getHeight() - margin * 2

      // 캔버스 px → mm 비율
      const pxPerMm = canvas.width / pdfPageW
      const pageHeightPx = pdfPageH * pxPerMm
      const totalPages = Math.ceil(canvas.height / pageHeightPx)

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage()

        const srcY = page * pageHeightPx
        const srcH = Math.min(pageHeightPx, canvas.height - srcY)

        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = srcH
        slice.getContext('2d')?.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)

        const imgData = slice.toDataURL('image/jpeg', 0.75)
        const sliceHeightMm = srcH / pxPerMm
        pdf.addImage(imgData, 'JPEG', margin, margin, pdfPageW, sliceHeightMm)
      }

      pdf.save(`${data.training.name}_등록부.pdf`)
    } catch {
      alert('PDF 내보내기에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }

  const myParticipant = data?.participants.find(p => p.userId === currentUserId)
  const signedCount = displayParticipants.filter(p => p.signature).length
  const totalCount = displayParticipants.length

  // 연수등록부의 연수내용-담당자 쌍 파싱
  const trainingItems: { content: string; manager: string }[] | null = (() => {
    if (!data?.training.registrationBook) return null
    try {
      const parsed = JSON.parse(data.training.registrationBook)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
      return null
    } catch { return null }
  })()

  return (
    <Layout>
      <div className="px-4 max-w-5xl mx-auto">
        {/* 상단 버튼 */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button
            onClick={() => navigate('/dashboard/signature-book')}
            className="text-gray-600 hover:text-gray-900 font-medium text-sm flex items-center gap-1"
          >
            ← 목록
          </button>
          <div className="flex-1" />
          {data && (
            <>
              {isAdmin && (
                <>
                  {customOrder && (
                    <button
                      onClick={() => setCustomOrder(null)}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 flex items-center gap-1"
                    >
                      ↺ 순서 초기화
                    </button>
                  )}
                  <button
                    onClick={openAddParticipant}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1"
                  >
                    ➕ 대상자 추가
                  </button>
                  <button
                    onClick={handleSyncStatus}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1"
                    title="서명했지만 미완료 상태인 참여자를 완료로 일괄 처리"
                  >
                    🔄 이수상태 동기화
                  </button>
                  <button
                    onClick={openShareLinkModal}
                    className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 flex items-center gap-1"
                  >
                    🔗 서명하기 링크 만들기
                  </button>
                </>
              )}
              <button
                onClick={exportPNG}
                disabled={exporting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
              >
                🖼️ PNG 저장
              </button>
              <button
                onClick={exportPDF}
                disabled={exporting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
              >
                📄 PDF 저장
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">불러오는 중...</div>
        ) : data ? (
          <>
            {/* 서명 현황 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-4">
              <span className="text-blue-800 font-medium">서명 현황</span>
              <span className="text-blue-700">{signedCount} / {totalCount}명 완료</span>
              {myParticipant && !myParticipant.signature && (
                <button
                  onClick={() => setSigningUserId(currentUserId)}
                  className="ml-auto px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  ✍️ 내 서명하기
                </button>
              )}
              {myParticipant?.signature && (
                <span className="ml-auto text-green-700 font-medium text-sm">✅ 서명 완료</span>
              )}
            </div>

            {/* 연수등록부 (출력 영역) */}
            <div ref={printRef} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              {/* 제목 */}
              <h1 className="text-2xl font-bold text-center text-gray-900 mb-4">연수등록부</h1>

              {/* 연수 정보 */}
              <table className="w-full mb-5 text-sm border border-gray-400" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold w-24">연수명</th>
                    <td className="border border-gray-400 px-3 py-2 font-medium" colSpan={3}>{data.training.name}</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold">실시일</th>
                    <td className="border border-gray-400 px-3 py-2">{data.training.implementationDate || '-'}</td>
                    <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold w-20">이수시간</th>
                    <td className="border border-gray-400 px-3 py-2">{data.training.hours || '-'}</td>
                  </tr>
                  {!trainingItems && (
                    <tr>
                      <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold">업무부서</th>
                      <td className="border border-gray-400 px-3 py-2">{data.training.department || '-'}</td>
                      <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold">담당자</th>
                      <td className="border border-gray-400 px-3 py-2">{data.training.manager}</td>
                    </tr>
                  )}
                  {trainingItems && (
                    <tr>
                      <th className="bg-gray-100 border border-gray-400 px-3 py-2 text-left font-semibold">업무부서</th>
                      <td className="border border-gray-400 px-3 py-2" colSpan={3}>{data.training.department || '-'}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* 연수내용-담당자 테이블 (연수등록부 만들기로 생성된 경우) */}
              {trainingItems && (
                <table className="w-full mb-5 text-sm border border-gray-400" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 px-2 py-2 text-center w-10">순번</th>
                      <th className="border border-gray-400 px-2 py-2 text-left">연수 내용</th>
                      <th className="border border-gray-400 px-2 py-2 text-center w-28">담당자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingItems.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-400 px-2 py-2 text-center text-gray-600">{idx + 1}</td>
                        <td className="border border-gray-400 px-2 py-2">{item.content}</td>
                        <td className="border border-gray-400 px-2 py-2 text-center">{item.manager}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 서명 테이블 */}
              <table className="w-full text-sm border border-gray-400" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 px-2 py-2 text-center w-10">순번</th>
                    <th className="border border-gray-400 px-2 py-2 text-center w-28">소속</th>
                    <th className="border border-gray-400 px-2 py-2 text-center w-24">직위</th>
                    <th className="border border-gray-400 px-2 py-2 text-center w-20">성명</th>
                    <th className="border border-gray-400 px-2 py-2 text-center">서명</th>
                    {isAdmin && (
                      <th className="border border-gray-400 px-2 py-2 text-center w-16 no-print">관리</th>
                    )}
                    {isAdmin && (
                      <th className="border border-gray-400 px-1 py-2 text-center w-12 no-print">순서</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayParticipants.map((p, idx) => (
                    <tr key={p.userId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-400 px-2 py-1 text-center text-gray-600">{idx + 1}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">{formatAffiliation(p)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">{p.position || p.userType}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center font-medium">{p.name}</td>
                      <td
                        className="border border-gray-400 px-1 py-1 text-center"
                        style={{ minHeight: '56px', height: '56px' }}
                      >
                        {p.signature ? (
                          <img
                            src={p.signature.signatureImage}
                            alt="서명"
                            className="max-h-12 mx-auto object-contain"
                          />
                        ) : (p.userId === currentUserId || isAdmin) ? (
                          <button
                            onClick={() => setSigningUserId(p.userId)}
                            className="text-xs text-blue-600 hover:underline no-print"
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
                            >
                              서명 삭제
                            </button>
                            )}
                            <button
                              onClick={() => handleRemoveParticipant(p)}
                              className="text-xs text-gray-500 hover:text-red-700"
                            >
                              대상 제외
                            </button>
                          </div>
                        </td>
                      )}
                      {isAdmin && (
                        <td className="border border-gray-400 px-1 py-1 text-center no-print">
                          <div className="flex flex-col gap-0.5 items-center">
                            <button
                              onClick={() => moveParticipant(idx, 'up')}
                              disabled={idx === 0}
                              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                              title="위로"
                            >▲</button>
                            <button
                              onClick={() => moveParticipant(idx, 'down')}
                              disabled={idx === displayParticipants.length - 1}
                              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                              title="아래로"
                            >▼</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 하단 확인란 */}
              <div className="mt-4 flex justify-end">
                <table className="text-sm border border-gray-400" style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <th className="bg-gray-100 border border-gray-400 px-4 py-2 font-semibold">총 인원</th>
                      <td className="border border-gray-400 px-6 py-2 text-center">{totalCount}명</td>
                      <th className="bg-gray-100 border border-gray-400 px-4 py-2 font-semibold">서명 완료</th>
                      <td className="border border-gray-400 px-6 py-2 text-center">{signedCount}명</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {showAddParticipant && (
        <ParticipantAddModal
          title="연수등록부 대상자 추가"
          users={allUsers}
          existingUserIds={(data?.participants ?? []).map(participant => participant.userId)}
          onClose={() => setShowAddParticipant(false)}
          onAddUsers={handleAddParticipants}
          onAddExternal={handleAddExternalParticipant}
        />
      )}

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
            <p className="text-sm text-gray-500 mb-4">아래 공간에 서명해 주세요. 마우스나 손가락으로 서명하세요.</p>
            {/* 저장된 서명 불러오기 버튼 (본인 서명 시에만 표시) */}
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
            {/* 내 서명 저장 버튼 (본인 서명 시에만 표시) */}
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
              <button
                type="button"
                onClick={() => signaturePadRef.current?.clear()}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                지우기
              </button>
              <button
                type="button"
                onClick={() => { setSigningUserId(null) }}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSign}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
              >
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
            <p className="text-gray-600 mb-4">이 서명을 삭제하시겠습니까? 삭제하면 다시 서명해야 합니다.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default SignatureBookDetail
