import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ParticipantAddModal from '../components/ParticipantAddModal'
import { isAdmin, getRole } from '../api/auth'
import {
  getParticipants, updateCompletionNumber, cancelCompletion,
  addTrainingParticipant, addExternalTrainingParticipant, removeTrainingParticipant
} from '../api/participants'
import { getTrainings } from '../api/trainings'
import { getUsers } from '../api/users'
import { TrainingParticipant, Training, User } from '../types'

const TrainingCollection = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [training, setTraining] = useState<Training | null>(null)
  const [participants, setParticipants] = useState<TrainingParticipant[]>([])
  const [filteredParticipants, setFilteredParticipants] = useState<TrainingParticipant[]>([])
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState<'default' | 'incomplete'>('default')
  const [filterIncomplete, setFilterIncomplete] = useState(false)
  const [showCompletionHelp, setShowCompletionHelp] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [isManualSort, setIsManualSort] = useState(false)
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const role = getRole()
  const adminUser = isAdmin() || role === 'TRAINING_ADMIN'

  useEffect(() => {
    if (id) {
      fetchData()
    }
  }, [id])

  useEffect(() => {
    // 정렬 및 필터링 적용
    let filtered = [...participants]

    // 미이수자만 필터링
    if (filterIncomplete) {
      filtered = filtered.filter(p => p.status !== 'completed' || !p.completionNumber)
    }

    // 교직원 유형별 순서: 교장 > 교감 > 담임 > 교과전담 > 유치원 > 행정실 > 그 외
    const getTypeOrder = (user: any): number => {
      const userType = user?.userType || ''
      const position = user?.position || ''
      const isTeacher = userType === '교원' || userType === '기간제교사'
      if (isTeacher) {
        if (position === '교장') return 0
        if (position === '교감') return 1
        if (user?.grade && user?.class) return 2  // 학급 담임
        return 3  // 교과 전담
      }
      if (userType === '유치원') return 4
      if (['직원', '공무직', '교육공무직', '교직원'].includes(userType)) return 5
      return 6
    }

    const baseSort = (a: TrainingParticipant, b: TrainingParticipant): number => {
      const aOrder = getTypeOrder(a.user)
      const bOrder = getTypeOrder(b.user)
      if (aOrder !== bOrder) return aOrder - bOrder
      const aGrade = parseInt(a.user?.grade || '99') || 99
      const bGrade = parseInt(b.user?.grade || '99') || 99
      if (aGrade !== bGrade) return aGrade - bGrade
      const aClass = parseInt(a.user?.class || '99') || 99
      const bClass = parseInt(b.user?.class || '99') || 99
      if (aClass !== bClass) return aClass - bClass
      return (a.user?.name || '').localeCompare(b.user?.name || '', 'ko')
    }

    if (sortBy === 'default') {
      filtered.sort(baseSort)
    } else if (sortBy === 'incomplete') {
      // 미이수자 우선 정렬
      filtered.sort((a, b) => {
        const aIncomplete = a.status !== 'completed' || !a.completionNumber
        const bIncomplete = b.status !== 'completed' || !b.completionNumber
        if (aIncomplete && !bIncomplete) return -1
        if (!aIncomplete && bIncomplete) return 1
        return baseSort(a, b)
      })
    }

    setFilteredParticipants(filtered)
    setIsManualSort(false)
  }, [participants, sortBy, filterIncomplete])

  const moveRow = (idx: number, dir: 'up' | 'down') => {
    setFilteredParticipants(prev => {
      const arr = [...prev]
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= arr.length) return prev
      ;[arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]
      return arr
    })
    setIsManualSort(true)
  }

  const resetManualSort = () => setParticipants(prev => [...prev])

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      console.log('🔄 데이터 로드 시작:', { trainingId: id })
      const trainings = await getTrainings()
      const foundTraining = trainings.find(t => t.id === id)
      if (foundTraining) {
        console.log('✅ 연수 정보 찾음:', foundTraining.name)
        setTraining(foundTraining)
      } else {
        console.warn('⚠️ 연수 정보를 찾을 수 없음:', id)
      }
      
      const data = await getParticipants(id)
      console.log('📊 참여자 데이터 로드 완료:', {
        trainingId: id,
        participantCount: data?.length || 0,
        isArray: Array.isArray(data),
        participants: data || []
      })
      
      // 데이터가 배열인지 확인
      if (Array.isArray(data)) {
        setParticipants(data)
      } else {
        console.error('❌ API 응답이 배열이 아닙니다:', data)
        setParticipants([])
      }
    } catch (error: any) {
      console.error('❌ 데이터 조회 오류:', {
        error,
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      })
      setParticipants([])
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateCompletionNumber = async (participantId: string, completionNumber: string) => {
    try {
      await updateCompletionNumber(participantId, completionNumber)
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.error || '이수번호 입력 중 오류가 발생했습니다.')
    }
  }

  const handleCancelCompletion = async (participantId: string) => {
    if (!confirm('이 참여자의 이수번호를 삭제하시겠습니까? 이수 상태가 미완료로 변경됩니다.')) return
    try {
      await cancelCompletion(participantId)
      fetchData()
    } catch (error: any) {
      alert(error.response?.data?.error || '이수번호 삭제 중 오류가 발생했습니다.')
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
    if (!id || userIds.length === 0) return
    try {
      await Promise.all(userIds.map(userId => addTrainingParticipant(id, userId)))
      setShowAddParticipant(false)
      await fetchData()
    } catch (error: any) {
      alert(error.response?.data?.error || '대상자 추가 중 오류가 발생했습니다.')
    }
  }

  const handleAddExternalParticipant = async (external: { name: string; affiliation?: string; position?: string }) => {
    if (!id) return
    try {
      await addExternalTrainingParticipant(id, external)
      setShowAddParticipant(false)
      await fetchData()
    } catch (error: any) {
      alert(error.response?.data?.error || '외부 대상자 추가 중 오류가 발생했습니다.')
    }
  }

  const handleRemoveParticipant = async (participant: TrainingParticipant) => {
    if (!id || !participant.user) return
    const completionNotice = participant.completionNumber ? '\n이 대상자의 이수번호도 해당 연수 목록에서 제외됩니다.' : ''
    if (!confirm(`${participant.user.name}님을 이 연수의 대상자에서 제외하시겠습니까?${completionNotice}\n사용자 계정과 다른 연수 기록은 삭제되지 않습니다.`)) return
    try {
      await removeTrainingParticipant(id, participant.user.id)
      await fetchData()
    } catch (error: any) {
      alert(error.response?.data?.error || '대상자 제거 중 오류가 발생했습니다.')
    }
  }

  const completedCount = participants.filter(p => p.status === 'completed').length
  const totalCount = participants.length
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const incompleteCount = participants.filter(p => p.status !== 'completed' || !p.completionNumber).length

  // 디버깅: 통계 값 확인
  useEffect(() => {
    if (participants.length > 0) {
      console.log('📈 참여자 통계:', {
        totalCount,
        completedCount,
        incompleteCount,
        completionRate: completionRate.toFixed(1) + '%',
        participants: participants.map(p => ({
          id: p.id,
          name: p.user?.name,
          status: p.status,
          completionNumber: p.completionNumber
        }))
      })
    }
  }, [participants, totalCount, completedCount, incompleteCount, completionRate])

  // 엑셀 내보내기 함수
  const handleExportToExcel = async () => {
    if (!training || filteredParticipants.length === 0) {
      alert('내보낼 데이터가 없습니다.')
      return
    }

    // 엑셀 데이터 준비
    const excelData = filteredParticipants.map((participant, index) => ({
      '순번': index + 1,
      '직위': participant.user?.position || '-',
      '학년': participant.user?.grade || '-',
      '반': participant.user?.class || '-',
      '성함': participant.user?.name || '-',
      '이수번호': participant.completionNumber || '-',
      '상태': participant.status === 'completed' ? '완료' : '미완료',
      '이메일': participant.user?.email || '-',
    }))

    const XLSX = await import('xlsx')
    // 워크북 생성
    const wb = XLSX.utils.book_new()
    
    // 통계 정보 시트
    const statsData = [
      ['연수명', training.name],
      ['연수 설명', training.description || '-'],
      ['이수 기한', training.deadline ? new Date(training.deadline).toLocaleDateString('ko-KR') : '미설정'],
      [''],
      ['통계 정보'],
      ['전체 참여자', totalCount],
      ['이수 완료', completedCount],
      ['미완료', incompleteCount],
      ['완료율', `${completionRate.toFixed(1)}%`],
      [''],
      ['내보낸 날짜', new Date().toLocaleString('ko-KR')]
    ]
    const statsWs = XLSX.utils.aoa_to_sheet(statsData)
    XLSX.utils.book_append_sheet(wb, statsWs, '통계')

    // 참여자 목록 시트
    const ws = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(wb, ws, '참여자 목록')

    // 파일명 생성 (연수명_날짜.xlsx)
    const fileName = `${training.name}_${new Date().toISOString().split('T')[0]}.xlsx`
      .replace(/[<>:"/\\|?*]/g, '_')

    // 엑셀 파일 다운로드
    XLSX.writeFile(wb, fileName)
  }

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-8">로딩 중...</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* 제목 + 버튼 행 */}
        <div className="flex justify-between items-start gap-4">
          <h1 className="text-2xl font-bold text-gray-900 leading-snug">
            {training?.name || '연수 취합'}
          </h1>
          <div className="flex shrink-0 gap-2 flex-wrap justify-end">
            <button
              onClick={handleExportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-1.5"
              disabled={filteredParticipants.length === 0}
            >
              📥 엑셀 내보내기
            </button>
            <button
              onClick={() => navigate('/dashboard/trainings')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium"
            >
              목록으로
            </button>
          </div>
        </div>

        {/* 연수 세부 정보 카드 */}
        {training && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
              {training.deadline && (
                <span className="font-semibold text-gray-800">
                  📅 이수 기한: {new Date(training.deadline).toLocaleDateString('ko-KR')}
                </span>
              )}
              {training.targetUsers && training.targetUsers.length > 0 && (
                <span>👥 대상자: {training.targetUsers.join(', ')}</span>
              )}
              {training.manager && (
                <span>👤 담당자: {training.manager}</span>
              )}
            </div>
            {training.description && (() => {
              const isLong = training.description!.length > 150 || training.description!.split('\n').length > 3
              return (
                <div className="border-t border-gray-100 pt-2">
                  <p className={`text-gray-700 whitespace-pre-line leading-relaxed ${isLong && !descExpanded ? 'line-clamp-3' : ''}`}>
                    {training.description}
                  </p>
                  {isLong && (
                    <button
                      onClick={() => setDescExpanded(v => !v)}
                      className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {descExpanded ? '▲ 접기' : '▼ 더 보기'}
                    </button>
                  )}
                </div>
              )
            })()}
            {(training.method || training.methodLink) && (
              <p className="text-gray-600 border-t border-gray-100 pt-2">
                <span className="font-medium">📎 연수자료:</span>
                {training.method && <span className="ml-1">{training.method}</span>}
                {training.methodLink && (
                  <a href={training.methodLink} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-600 hover:underline break-all">{training.methodLink}</a>
                )}
              </p>
            )}
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
              <div className="text-sm text-gray-500">전체 참여자</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
              <div className="text-sm text-gray-500">이수 완료</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {completionRate.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500">완료율</div>
            </div>
          </div>

          {/* 필터 및 정렬 */}
          {adminUser && (
            <div className="mb-4 flex gap-4 items-center flex-wrap">
              <button
                onClick={openAddParticipant}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-extrabold shadow-sm"
              >
                ➕ 대상자 추가
              </button>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filterIncomplete}
                  onChange={(e) => setFilterIncomplete(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-2 border-gray-400 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">미이수자만 보기</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSortBy('default')}
                  disabled={isManualSort}
                  className={`px-3 py-1 text-sm rounded-md ${
                    sortBy === 'default' && !isManualSort
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-40'
                  }`}
                >
                  기본 정렬
                </button>
                <button
                  onClick={() => setSortBy('incomplete')}
                  disabled={isManualSort}
                  className={`px-3 py-1 text-sm rounded-md ${
                    sortBy === 'incomplete' && !isManualSort
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-40'
                  }`}
                >
                  미이수자 우선
                </button>
              </div>
              {isManualSort && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-orange-600 font-medium">✏️ 수동 정렬 중</span>
                  <button
                    onClick={resetManualSort}
                    className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    순서 초기화
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    순번
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    직위
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    학년
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    반
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    성함
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
                    <div className="flex items-center gap-1">
                      이수번호
                      <button
                        type="button"
                        onClick={() => setShowCompletionHelp(!showCompletionHelp)}
                        className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold hover:bg-blue-200 flex items-center justify-center flex-shrink-0"
                        title="이수번호 안내"
                      >
                        ?
                      </button>
                    </div>
                    {showCompletionHelp && (
                      <div className="absolute z-10 mt-1 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-lg shadow-lg text-xs text-gray-700 normal-case font-normal w-64">
                        <p className="font-bold text-yellow-800 mb-1">📋 이수번호 찾는 방법</p>
                        <p>1. 연수 플랫폼(나이스, 티처빌 등)에 로그인</p>
                        <p>2. "나의 학습방" 또는 "학습이력" 메뉴로 이동</p>
                        <p>3. 해당 연수의 이수증에서 <strong>이수번호</strong>를 확인</p>
                        <p className="mt-1 text-yellow-700">* 이수증 발급 후 번호를 입력해주세요</p>
                      </div>
                    )}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    이메일
                  </th>
                  {adminUser && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      수정
                    </th>
                  )}
                  {adminUser && (
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                      순서
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredParticipants.map((participant, index) => (
                  <ParticipantRow
                    key={participant.id}
                    index={index}
                    totalCount={filteredParticipants.length}
                    participant={participant}
                    onUpdate={handleUpdateCompletionNumber}
                    onCancel={handleCancelCompletion}
                    onRemove={() => handleRemoveParticipant(participant)}
                    isAdmin={adminUser}
                    onMoveUp={() => moveRow(index, 'up')}
                    onMoveDown={() => moveRow(index, 'down')}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showAddParticipant && (
          <ParticipantAddModal
            title="연수 대상자 추가"
            users={allUsers}
            existingUserIds={participants.map(participant => participant.userId)}
            onClose={() => setShowAddParticipant(false)}
            onAddUsers={handleAddParticipants}
            onAddExternal={handleAddExternalParticipant}
          />
        )}
      </div>
    </Layout>
  )
}

interface ParticipantRowProps {
  index: number
  totalCount: number
  participant: TrainingParticipant
  onUpdate: (id: string, completionNumber: string) => void
  onCancel: (id: string) => void
  onRemove: () => void
  isAdmin: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

const ParticipantRow = ({ index, totalCount, participant, onUpdate, onCancel, onRemove, isAdmin, onMoveUp, onMoveDown }: ParticipantRowProps) => {
  const [editing, setEditing] = useState(false)
  const [completionNumber, setCompletionNumber] = useState(participant.completionNumber || '')

  const handleSubmit = () => {
    if (completionNumber.trim()) {
      onUpdate(participant.id, completionNumber.trim())
      setEditing(false)
    }
  }

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {index + 1}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {participant.user?.position || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {participant.user?.grade || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {participant.user?.class || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {participant.user?.name || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {editing ? (
          <input
            type="text"
            value={completionNumber}
            onChange={(e) => setCompletionNumber(e.target.value)}
            className="border-2 border-gray-400 rounded px-2 py-1 text-sm w-full"
            autoFocus
            onBlur={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSubmit()
              }
            }}
          />
        ) : (
          participant.completionNumber || '-'
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            participant.status === 'completed'
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {participant.status === 'completed' ? '완료' : '미완료'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {participant.user?.email || '-'}
      </td>
      {isAdmin && (
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          <button
            onClick={() => setEditing(!editing)}
            className="text-indigo-600 hover:text-indigo-900"
          >
            {editing ? '저장' : '이수번호 수정'}
          </button>
          {participant.status === 'completed' && (
            <button
              onClick={() => onCancel(participant.id)}
              className="text-red-600 hover:text-red-900"
            >
              이수번호 삭제
            </button>
          )}
          <button
            onClick={onRemove}
            className="text-red-700 hover:text-red-950"
          >
            대상 제외
          </button>
        </td>
      )}
      {isAdmin && (
        <td className="px-2 py-4 text-center whitespace-nowrap">
          <div className="flex flex-col gap-0.5 items-center">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
              title="위로"
            >▲</button>
            <button
              onClick={onMoveDown}
              disabled={index === totalCount - 1}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
              title="아래로"
            >▼</button>
          </div>
        </td>
      )}
    </tr>
  )
}

export default TrainingCollection
